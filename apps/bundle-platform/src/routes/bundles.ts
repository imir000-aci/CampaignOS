import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  getServiceDb,
  bundleSchema,
  bundles,
  bundleProducts,
  bundleOffers,
} from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import { hasPermission } from "@campaignos/rbac";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import { createLogger } from "@campaignos/otel";

const log = createLogger("bundle-platform");

function db() { return getServiceDb("POSTGRES_BUNDLE_URL", bundleSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

const BundleProductInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  isRequired: z.boolean().optional(),
  substituteProductIds: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

const BundleOfferInput = z.object({
  offerId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
});

const CreateBundleBody = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  bundleType: z.string().optional(),
  pricingRule: z.record(z.unknown()).optional(),
  savingsAmountCents: z.number().int().optional(),
  campaignId: z.string().uuid().optional(),
  seasonalTag: z.string().optional(),
  bundleProducts: z.array(BundleProductInput).optional(),
  bundleOffers: z.array(BundleOfferInput).optional(),
});

export async function bundleRoutes(app: FastifyInstance): Promise<void> {
  // GET /offers/bundles?status=
  app.get("/offers/bundles", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(bundles.deletedAt)];
    if (q["status"]) conditions.push(eq(bundles.status, q["status"] as never));

    const rows = await db()
      .select()
      .from(bundles)
      .where(and(...conditions))
      .orderBy(desc(bundles.createdAt));

    return reply.send({ data: rows });
  });

  // POST /offers/bundles
  app.post("/offers/bundles", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Creating bundle");

    const body = CreateBundleBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const store = db();

    const [bundle] = await store
      .insert(bundles)
      .values({
        name: body.data.name,
        description: body.data.description,
        bundleType: body.data.bundleType,
        pricingRule: body.data.pricingRule,
        savingsAmountCents: body.data.savingsAmountCents,
        campaignId: body.data.campaignId,
        seasonalTag: body.data.seasonalTag,
        status: "DRAFT",
      })
      .returning();

    if (!bundle) throw new Error("Insert returned no rows");

    if (body.data.bundleProducts?.length) {
      await store.insert(bundleProducts).values(
        body.data.bundleProducts.map((p) => ({
          bundleId: bundle.id,
          productId: p.productId,
          quantity: p.quantity,
          isRequired: p.isRequired,
          substituteProductIds: p.substituteProductIds,
          sortOrder: p.sortOrder,
        }))
      );
    }

    if (body.data.bundleOffers?.length) {
      await store.insert(bundleOffers).values(
        body.data.bundleOffers.map((o) => ({
          bundleId: bundle.id,
          offerId: o.offerId,
          isPrimary: o.isPrimary,
        }))
      );
    }

    return reply.status(201).send(bundle);
  });

  // GET /offers/bundles/:id
  app.get("/offers/bundles/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [bundle] = await db()
      .select()
      .from(bundles)
      .where(and(eq(bundles.id, id), isNull(bundles.deletedAt)))
      .limit(1);

    if (!bundle) return reply.status(404).send({ error: "Bundle not found" });

    const products = await db()
      .select()
      .from(bundleProducts)
      .where(and(eq(bundleProducts.bundleId, id), isNull(bundleProducts.deletedAt)));

    const offers = await db()
      .select()
      .from(bundleOffers)
      .where(and(eq(bundleOffers.bundleId, id), isNull(bundleOffers.deletedAt)));

    return reply.send({ ...bundle, bundleProducts: products, bundleOffers: offers });
  });

  // PATCH /offers/bundles/:id
  app.patch("/offers/bundles/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Updating bundle");

    const { id } = request.params as { id: string };
    const body = CreateBundleBody.omit({ bundleProducts: true, bundleOffers: true }).partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [updated] = await db()
      .update(bundles)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(bundles.id, id), isNull(bundles.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Bundle not found" });
    return reply.send(updated);
  });

  // DELETE /offers/bundles/:id
  app.delete("/offers/bundles/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Deleting bundle");

    const { id } = request.params as { id: string };

    const [deleted] = await db()
      .update(bundles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(bundles.id, id), isNull(bundles.deletedAt)))
      .returning({ id: bundles.id });

    if (!deleted) return reply.status(404).send({ error: "Bundle not found" });
    return reply.status(204).send();
  });
}
