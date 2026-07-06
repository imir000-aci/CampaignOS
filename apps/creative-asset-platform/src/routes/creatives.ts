import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  getServiceDb,
  creativeSchema,
  creativeAssets,
  assetAiMetadata,
  assetVersions,
  generationJobs,
} from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import { hasPermission } from "@campaignos/rbac";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import { createLogger } from "@campaignos/otel";

const log = createLogger("creative-asset-platform");

function db() { return getServiceDb("POSTGRES_CREATIVE_URL", creativeSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

const CreateAssetBody = z.object({
  name: z.string().min(1).max(500),
  assetType: z.enum(["IMAGE", "VIDEO", "HTML", "COPY", "AUDIO", "GIF"]),
  campaignId: z.string().uuid(),
  minioBucket: z.string().min(1),
  minioKey: z.string().min(1),
  mimeType: z.string().optional(),
  widthPx: z.number().int().optional(),
  heightPx: z.number().int().optional(),
  fileSizeBytes: z.number().int().optional(),
  channel: z.string().optional(),
});

const GenerateJobBody = z.object({
  campaignId: z.string().uuid(),
  jobType: z.string().min(1),
  inputPrompt: z.string().optional(),
  inputContext: z.record(z.unknown()).optional(),
});

const RejectBody = z.object({
  rejectionReason: z.string().min(1),
});

export async function creativeRoutes(app: FastifyInstance): Promise<void> {
  // GET /creatives?campaign_id=&status=&asset_type=
  app.get("/creatives", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(creativeAssets.deletedAt)];
    if (q["campaign_id"]) conditions.push(eq(creativeAssets.campaignId, q["campaign_id"] as never));
    if (q["status"]) conditions.push(eq(creativeAssets.status, q["status"] as never));
    if (q["asset_type"]) conditions.push(eq(creativeAssets.assetType, q["asset_type"] as never));

    const rows = await db()
      .select()
      .from(creativeAssets)
      .where(and(...conditions))
      .orderBy(desc(creativeAssets.createdAt));

    return reply.send({ data: rows });
  });

  // POST /creatives
  app.post("/creatives", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Creating creative asset");

    const body = CreateAssetBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [asset] = await db()
      .insert(creativeAssets)
      .values({
        name: body.data.name,
        assetType: body.data.assetType,
        campaignId: body.data.campaignId,
        minioBucket: body.data.minioBucket,
        minioKey: body.data.minioKey,
        mimeType: body.data.mimeType,
        widthPx: body.data.widthPx,
        heightPx: body.data.heightPx,
        fileSizeBytes: body.data.fileSizeBytes,
        channel: body.data.channel,
        status: "READY",
      })
      .returning();

    if (!asset) throw new Error("Insert returned no rows");
    return reply.status(201).send(asset);
  });

  // POST /creatives/generate — MUST be registered before /creatives/:id
  app.post("/creatives/generate", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Creating generation job");

    const body = GenerateJobBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [job] = await db()
      .insert(generationJobs)
      .values({
        campaignId: body.data.campaignId,
        jobType: body.data.jobType,
        inputPrompt: body.data.inputPrompt,
        inputContext: body.data.inputContext,
        status: "QUEUED",
      })
      .returning();

    if (!job) throw new Error("Insert returned no rows");

    await publishEvent(
      KAFKA_TOPICS.CREATIVE_ASSET_PROCESSED,
      "creative.asset.processed",
      { jobId: job.id, campaignId: body.data.campaignId, status: "QUEUED" },
      job.id
    );

    return reply.send({ jobId: job.id });
  });

  // GET /creatives/generate/:jobId — MUST be registered before /creatives/:id
  app.get("/creatives/generate/:jobId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const [job] = await db()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .limit(1);

    if (!job) return reply.status(404).send({ error: "Generation job not found" });
    return reply.send(job);
  });

  // GET /creatives/:id
  app.get("/creatives/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [asset] = await db()
      .select()
      .from(creativeAssets)
      .where(and(eq(creativeAssets.id, id), isNull(creativeAssets.deletedAt)))
      .limit(1);

    if (!asset) return reply.status(404).send({ error: "Creative asset not found" });

    const [metadata] = await db()
      .select()
      .from(assetAiMetadata)
      .where(eq(assetAiMetadata.assetId, id))
      .limit(1);

    return reply.send({ ...asset, aiMetadata: metadata ?? null });
  });

  // PATCH /creatives/:id
  app.patch("/creatives/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Updating creative asset");

    const { id } = request.params as { id: string };
    const body = CreateAssetBody.partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [updated] = await db()
      .update(creativeAssets)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(creativeAssets.id, id), isNull(creativeAssets.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Creative asset not found" });
    return reply.send(updated);
  });

  // DELETE /creatives/:id
  app.delete("/creatives/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Deleting creative asset");

    const { id } = request.params as { id: string };

    const [deleted] = await db()
      .update(creativeAssets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(creativeAssets.id, id), isNull(creativeAssets.deletedAt)))
      .returning({ id: creativeAssets.id });

    if (!deleted) return reply.status(404).send({ error: "Creative asset not found" });
    return reply.status(204).send();
  });

  // POST /creatives/:id/approve
  app.post("/creatives/:id/approve", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    const { id } = request.params as { id: string };

    const [updated] = await db()
      .update(creativeAssets)
      .set({
        status: "READY",
        approvedAt: new Date(),
        approvedBy: user.sub,
        updatedAt: new Date(),
      })
      .where(and(eq(creativeAssets.id, id), isNull(creativeAssets.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Creative asset not found" });

    await publishEvent(
      KAFKA_TOPICS.CREATIVE_ASSET_APPROVED,
      "creative.asset.approved",
      { assetId: id, approvedBy: user.sub },
      id
    );

    return reply.send(updated);
  });

  // POST /creatives/:id/reject
  app.post("/creatives/:id/reject", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Rejecting creative asset");

    const { id } = request.params as { id: string };
    const body = RejectBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [updated] = await db()
      .update(creativeAssets)
      .set({
        status: "FAILED",
        rejectionReason: body.data.rejectionReason,
        updatedAt: new Date(),
      })
      .where(and(eq(creativeAssets.id, id), isNull(creativeAssets.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Creative asset not found" });
    return reply.send(updated);
  });

  // GET /creatives/:id/versions
  app.get("/creatives/:id/versions", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db()
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.assetId, id))
      .orderBy(desc(assetVersions.createdAt));

    return reply.send({ data: rows });
  });
}
