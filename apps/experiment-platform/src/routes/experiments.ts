import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import {
  getServiceDb,
  experimentSchema,
  experiments,
  experimentVariants,
  experimentResults,
} from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import type { JwtPayload } from "@campaignos/types";

function db() { return getServiceDb("POSTGRES_EXPERIMENT_URL", experimentSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

const VariantSchema = z.object({
  variantKey: z.string().min(1).max(100),
  isControl: z.boolean().optional(),
  allocationPct: z.number().positive(),
});

const CreateBody = z.object({
  campaignId: z.string().uuid(),
  experimentType: z.enum(["AB", "MULTIVARIATE", "HOLDOUT", "GEO_SPLIT"]),
  name: z.string().min(1).max(500),
  hypothesis: z.string().optional(),
  primaryMetric: z.string().min(1).max(255),
  secondaryMetrics: z.array(z.string()).optional(),
  minimumDetectableEffect: z.number().optional(),
  confidenceLevel: z.number().optional(),
  statisticalPower: z.number().optional(),
  variants: z.array(VariantSchema).optional(),
});

const DeclareWinnerBody = z.object({
  winningVariantId: z.string().uuid(),
});

export async function experimentRoutes(app: FastifyInstance): Promise<void> {
  // GET /experiments?campaign_id=&status=
  app.get("/experiments", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(experiments.deletedAt)];
    if (q["campaign_id"]) conditions.push(eq(experiments.campaignId, q["campaign_id"]));
    if (q["status"]) conditions.push(eq(experiments.status, q["status"] as never));

    const rows = await db()
      .select()
      .from(experiments)
      .where(and(...conditions))
      .orderBy(desc(experiments.createdAt));

    return reply.send({ data: rows });
  });

  // POST /experiments
  app.post("/experiments", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = CreateBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const store = db();
    const [experiment] = await store
      .insert(experiments)
      .values({
        campaignId: body.data.campaignId,
        experimentType: body.data.experimentType,
        name: body.data.name,
        hypothesis: body.data.hypothesis,
        primaryMetric: body.data.primaryMetric,
        secondaryMetrics: body.data.secondaryMetrics,
        minimumDetectableEffect: body.data.minimumDetectableEffect,
        confidenceLevel: body.data.confidenceLevel,
        statisticalPower: body.data.statisticalPower,
        status: "DRAFT",
      })
      .returning();

    if (!experiment) throw new Error("Insert returned no rows");

    if (body.data.variants?.length) {
      await store.insert(experimentVariants).values(
        body.data.variants.map((v) => ({
          experimentId: experiment.id,
          variantKey: v.variantKey,
          isControl: v.isControl ?? false,
          allocationPct: v.allocationPct,
        }))
      );
    }

    return reply.status(201).send(experiment);
  });

  // GET /experiments/:id
  app.get("/experiments/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [experiment] = await db()
      .select()
      .from(experiments)
      .where(and(eq(experiments.id, id), isNull(experiments.deletedAt)))
      .limit(1);

    if (!experiment) return reply.status(404).send({ error: "Experiment not found" });

    const variants = await db()
      .select()
      .from(experimentVariants)
      .where(and(eq(experimentVariants.experimentId, id), isNull(experimentVariants.deletedAt)));

    const results = await db()
      .select()
      .from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), isNull(experimentResults.deletedAt)));

    return reply.send({ ...experiment, variants, results });
  });

  // PATCH /experiments/:id
  app.patch("/experiments/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = CreateBody.omit({ variants: true }).partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [updated] = await db()
      .update(experiments)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(experiments.id, id), isNull(experiments.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Experiment not found" });
    return reply.send(updated);
  });

  // DELETE /experiments/:id
  app.delete("/experiments/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db()
      .update(experiments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(experiments.id, id), isNull(experiments.deletedAt)))
      .returning({ id: experiments.id });

    if (!deleted) return reply.status(404).send({ error: "Experiment not found" });
    return reply.status(204).send();
  });

  // GET /experiments/:id/results
  app.get("/experiments/:id/results", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [experiment] = await db()
      .select()
      .from(experiments)
      .where(and(eq(experiments.id, id), isNull(experiments.deletedAt)))
      .limit(1);

    if (!experiment) return reply.status(404).send({ error: "Experiment not found" });

    const variants = await db()
      .select()
      .from(experimentVariants)
      .where(and(eq(experimentVariants.experimentId, id), isNull(experimentVariants.deletedAt)));

    const rawResults = await db()
      .select()
      .from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), isNull(experimentResults.deletedAt)));

    const results = rawResults.map((result) => ({
      ...result,
      significanceBadge: result.isSignificant
        ? "SIGNIFICANT"
        : result.pValue !== null && result.pValue !== undefined && result.pValue < 0.1
        ? "TRENDING"
        : "NOT_SIGNIFICANT",
    }));

    return reply.send({ data: results, variants });
  });

  // POST /experiments/:id/declare-winner
  app.post("/experiments/:id/declare-winner", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = DeclareWinnerBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [updated] = await db()
      .update(experiments)
      .set({ status: "CONCLUDED", updatedAt: new Date() })
      .where(and(eq(experiments.id, id), isNull(experiments.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Experiment not found" });

    await publishEvent(
      KAFKA_TOPICS.EXPERIMENT_CONCLUDED,
      "experiment.concluded",
      { experimentId: id, winningVariantId: body.data.winningVariantId },
      id
    );

    return reply.send({ experimentId: id, winningVariantId: body.data.winningVariantId, status: "CONCLUDED" });
  });

  // GET /experiments/:id/power
  app.get("/experiments/:id/power", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [experiment] = await db()
      .select()
      .from(experiments)
      .where(and(eq(experiments.id, id), isNull(experiments.deletedAt)))
      .limit(1);

    if (!experiment) return reply.status(404).send({ error: "Experiment not found" });

    const p = 0.05;
    const z_alpha = 1.96;
    const z_beta = 0.84;
    const mde = experiment.minimumDetectableEffect ?? 0.05;

    const n = Math.ceil(2 * Math.pow(z_alpha + z_beta, 2) * p * (1 - p) / Math.pow(mde, 2));
    const estimatedDurationDays = Math.ceil(n / 1000);
    const achievableMde = Math.sqrt(2 * Math.pow(z_alpha + z_beta, 2) * p * (1 - p) / n);

    return reply.send({
      sampleSizePerCell: n,
      estimatedDurationDays,
      achievableMde: parseFloat(achievableMde.toFixed(4)),
    });
  });
}
