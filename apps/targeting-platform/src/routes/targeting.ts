import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  getServiceDb,
  targetingSchema,
  targetingConfigs,
  frequencyCaps,
  geoTargets,
  daypartSchedules,
  suppressionLists,
} from "@campaignos/db-client";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import { hasPermission } from "@campaignos/rbac";
import { createLogger } from "@campaignos/otel";

const log = createLogger("targeting-platform");

const CreateBody = z.object({
  campaignId: z.string().uuid(),
  audienceId: z.string().uuid(),
  channel: z.string().min(1).max(100),
  bidStrategy: z.enum(["CPM", "CPC", "CPA", "TARGET_ROAS", "MANUAL"]),
  bidAmountCents: z.number().int().optional(),
  dailyBudgetCents: z.number().int().optional(),
  totalBudgetCents: z.number().int().optional(),
  estimatedReach: z.number().int().optional(),
  platformConfig: z.unknown().optional(),
});

function db() { return getServiceDb("POSTGRES_TARGETING_URL", targetingSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

export async function targetingRoutes(app: FastifyInstance): Promise<void> {
  // GET /targeting/channels — no auth needed
  app.get("/targeting/channels", async (_request, reply) => {
    return reply.send({
      data: ["EMAIL", "PUSH", "SMS", "DISPLAY", "PAID_SOCIAL", "PAID_SEARCH", "PROGRAMMATIC", "IN_APP"],
    });
  });

  // GET /targeting/configs?campaign_id=&channel=
  app.get("/targeting/configs", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(targetingConfigs.deletedAt)];
    if (q["campaign_id"]) conditions.push(eq(targetingConfigs.campaignId, q["campaign_id"]));
    if (q["channel"]) conditions.push(eq(targetingConfigs.channel, q["channel"]));

    const rows = await db()
      .select()
      .from(targetingConfigs)
      .where(and(...conditions))
      .orderBy(desc(targetingConfigs.createdAt));

    return reply.send({ data: rows });
  });

  // POST /targeting/configs
  app.post("/targeting/configs", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "targeting:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = CreateBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const [config] = await db()
      .insert(targetingConfigs)
      .values({
        campaignId: body.data.campaignId,
        audienceId: body.data.audienceId,
        channel: body.data.channel,
        bidStrategy: body.data.bidStrategy,
        bidAmountCents: body.data.bidAmountCents,
        dailyBudgetCents: body.data.dailyBudgetCents,
        totalBudgetCents: body.data.totalBudgetCents,
        estimatedReach: body.data.estimatedReach,
        platformConfig: body.data.platformConfig,
        status: "DRAFT",
      })
      .returning();

    if (!config) throw new Error("Insert returned no rows");

    return reply.status(201).send(config);
  });

  // GET /targeting/configs/:id
  app.get("/targeting/configs/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [config] = await db()
      .select()
      .from(targetingConfigs)
      .where(and(eq(targetingConfigs.id, id), isNull(targetingConfigs.deletedAt)))
      .limit(1);

    if (!config) return reply.status(404).send({ error: "Targeting config not found" });

    const [caps, geos, dayparts] = await Promise.all([
      db()
        .select()
        .from(frequencyCaps)
        .where(and(eq(frequencyCaps.targetingConfigId, id), isNull(frequencyCaps.deletedAt))),
      db()
        .select()
        .from(geoTargets)
        .where(and(eq(geoTargets.targetingConfigId, id), isNull(geoTargets.deletedAt))),
      db()
        .select()
        .from(daypartSchedules)
        .where(and(eq(daypartSchedules.targetingConfigId, id), isNull(daypartSchedules.deletedAt))),
    ]);

    return reply.send({ ...config, frequencyCaps: caps, geoTargets: geos, daypartSchedules: dayparts });
  });

  // PUT /targeting/configs/:id
  app.put("/targeting/configs/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "targeting:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const body = CreateBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const [updated] = await db()
      .update(targetingConfigs)
      .set({
        campaignId: body.data.campaignId,
        audienceId: body.data.audienceId,
        channel: body.data.channel,
        bidStrategy: body.data.bidStrategy,
        bidAmountCents: body.data.bidAmountCents,
        dailyBudgetCents: body.data.dailyBudgetCents,
        totalBudgetCents: body.data.totalBudgetCents,
        estimatedReach: body.data.estimatedReach,
        platformConfig: body.data.platformConfig,
        updatedAt: new Date(),
      })
      .where(and(eq(targetingConfigs.id, id), isNull(targetingConfigs.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Targeting config not found" });
    return reply.send(updated);
  });

  // DELETE /targeting/configs/:id
  app.delete("/targeting/configs/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "targeting:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const [deleted] = await db()
      .update(targetingConfigs)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(targetingConfigs.id, id), isNull(targetingConfigs.deletedAt)))
      .returning({ id: targetingConfigs.id });

    if (!deleted) return reply.status(404).send({ error: "Targeting config not found" });
    return reply.status(204).send();
  });

  // POST /targeting/configs/:id/validate
  app.post("/targeting/configs/:id/validate", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [config] = await db()
      .select()
      .from(targetingConfigs)
      .where(and(eq(targetingConfigs.id, id), isNull(targetingConfigs.deletedAt)))
      .limit(1);

    if (!config) return reply.status(404).send({ error: "Targeting config not found" });

    const issues: string[] = [];

    if (!config.estimatedReach || config.estimatedReach <= 0) {
      issues.push("Estimated reach must be greater than 0");
    }
    if (!config.totalBudgetCents || config.totalBudgetCents <= 0) {
      issues.push("Budget must be greater than 0");
    }

    return reply.send({ valid: issues.length === 0, issues });
  });
}
