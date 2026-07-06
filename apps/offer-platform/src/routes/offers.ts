import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { getServiceDb, offerSchema, offers, offerEligibilityRules, offerRedemptions } from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import { hasPermission } from "@campaignos/rbac";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import { createLogger } from "@campaignos/otel";

const log = createLogger("offer-platform");

const CreateBody = z.object({
  name: z.string().min(1).max(500),
  offerType: z.enum(["PERCENT_OFF", "DOLLAR_OFF", "BOGO", "FREE_ITEM", "POINTS_MULTIPLIER"]),
  description: z.string().optional(),
  discountValue: z.number().int().positive(),
  minPurchaseCents: z.number().int().optional(),
  maxRedemptionsPerCustomer: z.number().int().optional(),
  budgetTotalCents: z.number().int().optional(),
  externalOfferCode: z.string().optional(),
  terms: z.string().optional(),
  eligibilityRules: z.array(z.object({
    ruleType: z.string(),
    ruleValue: z.unknown(),
    includeOrExclude: z.boolean().default(true),
  })).optional(),
});

const EligibilityBody = z.object({
  pairs: z.array(z.object({ customerId: z.string(), offerId: z.string().uuid() })).min(1).max(100),
});

function db() { return getServiceDb("POSTGRES_OFFER_URL", offerSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

export async function offerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/offers", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(offers.deletedAt)];
    if (q["status"]) conditions.push(eq(offers.status, q["status"] as never));

    const rows = await db()
      .select()
      .from(offers)
      .where(and(...conditions))
      .orderBy(desc(offers.createdAt))
      .limit(Math.min(parseInt(q["limit"] ?? "20"), 100));

    return reply.send({ data: rows });
  });

  app.post("/offers", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "offers:create")) return reply.status(403).send({ error: "Forbidden" });

    const body = CreateBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const store = db();
    const [offer] = await store
      .insert(offers)
      .values({
        name: body.data.name,
        offerType: body.data.offerType,
        description: body.data.description,
        discountValue: body.data.discountValue,
        minPurchaseCents: body.data.minPurchaseCents,
        maxRedemptionsPerCustomer: body.data.maxRedemptionsPerCustomer,
        budgetTotalCents: body.data.budgetTotalCents,
        budgetRemainingCents: body.data.budgetTotalCents,
        externalOfferCode: body.data.externalOfferCode,
        terms: body.data.terms,
        status: "DRAFT",
      })
      .returning();

    if (!offer) throw new Error("Insert returned no rows");

    if (body.data.eligibilityRules?.length) {
      await store.insert(offerEligibilityRules).values(
        body.data.eligibilityRules.map((r) => ({
          offerId: offer.id,
          ruleType: r.ruleType,
          ruleValue: r.ruleValue,
          includeOrExclude: r.includeOrExclude,
        }))
      );
    }

    return reply.status(201).send(offer);
  });

  app.get("/offers/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [offer] = await db()
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), isNull(offers.deletedAt)))
      .limit(1);
    if (!offer) return reply.status(404).send({ error: "Offer not found" });

    const rules = await db()
      .select()
      .from(offerEligibilityRules)
      .where(and(eq(offerEligibilityRules.offerId, id), isNull(offerEligibilityRules.deletedAt)));

    return reply.send({ ...offer, eligibilityRules: rules });
  });

  app.patch("/offers/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "offers:create")) return reply.status(403).send({ error: "Forbidden" });

    const { id } = request.params as { id: string };
    const body = CreateBody.partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed" });

    const [updated] = await db()
      .update(offers)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(offers.id, id), isNull(offers.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Offer not found" });
    return reply.send(updated);
  });

  // Activate / pause / expire offer
  for (const action of ["activate", "pause", "expire"] as const) {
    const statusMap = { activate: "ACTIVE", pause: "PAUSED", expire: "EXPIRED" } as const;

    app.post(`/offers/:id/${action}`, { onRequest: [app.authenticate] }, async (request, reply) => {
      const user = getUser(request);
      if (!hasPermission(user.role as RbacRole, "offers:create")) return reply.status(403).send({ error: "Forbidden" });

      const { id } = request.params as { id: string };
      const [updated] = await db()
        .update(offers)
        .set({ status: statusMap[action], updatedAt: new Date() })
        .where(and(eq(offers.id, id), isNull(offers.deletedAt)))
        .returning();

      if (!updated) return reply.status(404).send({ error: "Offer not found" });

      await publishEvent(
        KAFKA_TOPICS["offer.status.changed"],
        "offer.status.changed",
        { offerId: id, status: statusMap[action] },
        id
      );

      return reply.send(updated);
    });
  }

  app.delete("/offers/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "offers:create")) return reply.status(403).send({ error: "Forbidden" });

    const { id } = request.params as { id: string };
    const [deleted] = await db()
      .update(offers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(offers.id, id), isNull(offers.deletedAt)))
      .returning({ id: offers.id });

    if (!deleted) return reply.status(404).send({ error: "Offer not found" });
    return reply.status(204).send();
  });

  // POST /offers/eligibility — batch eligibility check
  app.post("/offers/eligibility", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = EligibilityBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed" });

    const offerIds = [...new Set(body.data.pairs.map((p) => p.offerId))];
    const activeOffers = await db()
      .select({ id: offers.id, status: offers.status })
      .from(offers)
      .where(and(inArray(offers.id, offerIds), isNull(offers.deletedAt)));

    const activeSet = new Set(activeOffers.filter((o) => o.status === "ACTIVE").map((o) => o.id));

    const results = body.data.pairs.map((pair) => ({
      customerId: pair.customerId,
      offerId: pair.offerId,
      eligible: activeSet.has(pair.offerId),
      reason: activeSet.has(pair.offerId) ? "OFFER_ACTIVE" : "OFFER_NOT_ACTIVE",
    }));

    return reply.send({ data: results });
  });

  // GET /offers/:id/redemption-stats
  app.get("/offers/:id/redemption-stats", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [stats] = await db()
      .select({
        totalRedemptions: sql<string>`count(*)`,
        totalDiscountCents: sql<string>`sum(discount_applied_cents)`,
        uniqueCustomers: sql<string>`count(distinct customer_id)`,
      })
      .from(offerRedemptions)
      .where(eq(offerRedemptions.offerId, id));

    return reply.send({
      totalRedemptions: parseInt(stats?.totalRedemptions ?? "0"),
      totalDiscountDollars: parseInt(stats?.totalDiscountCents ?? "0") / 100,
      uniqueCustomers: parseInt(stats?.uniqueCustomers ?? "0"),
    });
  });
}
