import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import {
  getServiceDb,
  activationSchema,
  activationRequests,
  activationEvents,
  activationJobHistory,
} from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import { hasPermission } from "@campaignos/rbac";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import { createLogger } from "@campaignos/otel";

const log = createLogger("activation-platform");

function db() { return getServiceDb("POSTGRES_ACTIVATION_URL", activationSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

const CreateRequestBody = z.object({
  campaignId: z.string().uuid(),
  platform: z.enum(["BRAZE", "SFMC", "AEM", "INTERNAL_PUSH", "INTERNAL_SMS"]),
  audienceId: z.string().uuid(),
  experienceId: z.string().uuid().optional(),
  targetingConfigId: z.string().uuid().optional(),
  offerId: z.string().uuid().optional(),
  requestPayload: z.record(z.unknown()).optional(),
});

const CancelBody = z.object({
  reason: z.string().optional(),
});

export async function activationRoutes(app: FastifyInstance): Promise<void> {
  // POST /activation/requests
  app.post("/activation/requests", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Creating activation request");

    const body = CreateRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const store = db();

    const [req] = await store
      .insert(activationRequests)
      .values({
        campaignId: body.data.campaignId,
        platform: body.data.platform,
        audienceId: body.data.audienceId,
        experienceId: body.data.experienceId,
        targetingConfigId: body.data.targetingConfigId,
        offerId: body.data.offerId,
        requestPayload: body.data.requestPayload,
        status: "QUEUED",
      })
      .returning();

    if (!req) throw new Error("Insert returned no rows");

    await store.insert(activationJobHistory).values({
      activationRequestId: req.id,
      newStatus: "QUEUED",
      actorType: "API",
    });

    await publishEvent(
      KAFKA_TOPICS.ACTIVATION_JOB_COMPLETED,
      "activation.job.completed",
      { activationRequestId: req.id, campaignId: body.data.campaignId, platform: body.data.platform, status: "QUEUED" },
      req.id
    );

    return reply.status(201).send(req);
  });

  // GET /activation/requests?campaign_id=&platform=&status=
  app.get("/activation/requests", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(activationRequests.deletedAt)];
    if (q["campaign_id"]) conditions.push(eq(activationRequests.campaignId, q["campaign_id"] as never));
    if (q["platform"]) conditions.push(eq(activationRequests.platform, q["platform"] as never));
    if (q["status"]) conditions.push(eq(activationRequests.status, q["status"] as never));

    const rows = await db()
      .select()
      .from(activationRequests)
      .where(and(...conditions))
      .orderBy(desc(activationRequests.createdAt));

    return reply.send({ data: rows });
  });

  // GET /activation/requests/:id
  app.get("/activation/requests/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [req] = await db()
      .select()
      .from(activationRequests)
      .where(and(eq(activationRequests.id, id), isNull(activationRequests.deletedAt)))
      .limit(1);

    if (!req) return reply.status(404).send({ error: "Activation request not found" });

    const history = await db()
      .select()
      .from(activationJobHistory)
      .where(eq(activationJobHistory.activationRequestId, id))
      .orderBy(desc(activationJobHistory.createdAt));

    return reply.send({ ...req, history });
  });

  // POST /activation/requests/:id/cancel
  app.post("/activation/requests/:id/cancel", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Cancelling activation request");

    const { id } = request.params as { id: string };
    const body = CancelBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const store = db();

    const [updated] = await store
      .update(activationRequests)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: body.data.reason,
        updatedAt: new Date(),
      })
      .where(and(eq(activationRequests.id, id), isNull(activationRequests.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Activation request not found" });

    await store.insert(activationJobHistory).values({
      activationRequestId: id,
      newStatus: "CANCELLED",
      actorType: "API",
    });

    return reply.send(updated);
  });

  // POST /activation/requests/:id/retry
  app.post("/activation/requests/:id/retry", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    log.info({ userId: user.sub }, "Retrying activation request");

    const { id } = request.params as { id: string };

    const store = db();

    const [existing] = await store
      .select()
      .from(activationRequests)
      .where(and(eq(activationRequests.id, id), isNull(activationRequests.deletedAt)))
      .limit(1);

    if (!existing) return reply.status(404).send({ error: "Activation request not found" });

    const [updated] = await store
      .update(activationRequests)
      .set({
        status: "QUEUED",
        retryCount: existing.retryCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(activationRequests.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Activation request not found" });

    await store.insert(activationJobHistory).values({
      activationRequestId: id,
      newStatus: "QUEUED",
      note: "retry",
      actorType: "API",
    });

    await publishEvent(
      KAFKA_TOPICS.ACTIVATION_JOB_COMPLETED,
      "activation.job.completed",
      { activationRequestId: id, campaignId: existing.campaignId, platform: existing.platform, status: "QUEUED" },
      id
    );

    return reply.send(updated);
  });

  // GET /activation/requests/:id/delivery-status
  app.get("/activation/requests/:id/delivery-status", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [req] = await db()
      .select()
      .from(activationRequests)
      .where(and(eq(activationRequests.id, id), isNull(activationRequests.deletedAt)))
      .limit(1);

    if (!req) return reply.status(404).send({ error: "Activation request not found" });

    const [countResult] = await db()
      .select({ count: sql<string>`count(*)` })
      .from(activationEvents)
      .where(eq(activationEvents.activationRequestId, id));

    return reply.send({
      platform: req.platform,
      status: req.status,
      activationEvents: parseInt(countResult?.count ?? "0"),
    });
  });
}
