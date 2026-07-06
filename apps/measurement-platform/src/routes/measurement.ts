import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import {
  getServiceDb,
  measurementSchema,
  revenueEvents,
  campaignAttributions,
  measurementRollups,
  liftStudies,
  kpiDefinitions,
} from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import type { JwtPayload } from "@campaignos/types";

function db() { return getServiceDb("POSTGRES_MEASUREMENT_URL", measurementSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

const CreateKpiBody = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(255),
  formula: z.string().optional(),
  dataSources: z.array(z.string()).optional(),
  attributionModel: z.enum(["LAST_TOUCH", "FIRST_TOUCH", "LINEAR", "TIME_DECAY", "DATA_DRIVEN"]).optional(),
  measurementWindowDays: z.number().int().positive().optional(),
  anomalyThresholdPct: z.number().optional(),
});

const RevenueEventSchema = z.object({
  eventId: z.string().min(1).max(255),
  customerId: z.string().min(1).max(255),
  eventType: z.string().min(1).max(100),
  totalAmountCents: z.number().int(),
  occurredAt: z.string(),
  storeId: z.string().optional(),
  channel: z.string().optional(),
  rawPayload: z.record(z.unknown()).optional(),
});

const IngestEventsBody = z.object({
  events: z.array(RevenueEventSchema).min(1).max(1000),
});

export async function measurementRoutes(app: FastifyInstance): Promise<void> {
  // GET /measurement/kpis?campaign_id=
  app.get("/measurement/kpis", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(kpiDefinitions.deletedAt)];
    if (q["campaign_id"]) conditions.push(eq(kpiDefinitions.campaignId, q["campaign_id"]));

    const rows = await db()
      .select()
      .from(kpiDefinitions)
      .where(and(...conditions))
      .orderBy(desc(kpiDefinitions.createdAt));

    return reply.send({ data: rows });
  });

  // POST /measurement/kpis
  app.post("/measurement/kpis", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = CreateKpiBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const [kpi] = await db()
      .insert(kpiDefinitions)
      .values({
        campaignId: body.data.campaignId,
        name: body.data.name,
        formula: body.data.formula,
        dataSources: body.data.dataSources,
        attributionModel: body.data.attributionModel,
        measurementWindowDays: body.data.measurementWindowDays,
        anomalyThresholdPct: body.data.anomalyThresholdPct,
      })
      .returning();

    if (!kpi) throw new Error("Insert returned no rows");
    return reply.status(201).send(kpi);
  });

  // GET /measurement/campaigns/:id/metrics?channel=&start=&end=
  app.get("/measurement/campaigns/:id/metrics", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string>;
    const conditions = [eq(measurementRollups.campaignId, id)];
    if (q["channel"]) conditions.push(eq(measurementRollups.channel, q["channel"]));

    const rows = await db()
      .select()
      .from(measurementRollups)
      .where(and(...conditions))
      .orderBy(desc(measurementRollups.rollupDate));

    return reply.send({ data: rows });
  });

  // GET /measurement/campaigns/:id/funnel
  app.get("/measurement/campaigns/:id/funnel", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [agg] = await db().select({
      impressions: sql<string>`sum(impressions)`,
      clicks: sql<string>`sum(clicks)`,
      conversions: sql<string>`sum(conversions)`,
    }).from(measurementRollups).where(eq(measurementRollups.campaignId, id));

    const impressions = Number(agg?.impressions ?? 0);
    const clicks = Number(agg?.clicks ?? 0);
    const conversions = Number(agg?.conversions ?? 0);
    const conversion_rate = conversions > 0 && impressions > 0 ? conversions / impressions : 0;

    return reply.send({ impressions, clicks, conversions, conversion_rate });
  });

  // GET /measurement/campaigns/:id/attribution?model=LAST_TOUCH
  app.get("/measurement/campaigns/:id/attribution", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string>;
    const model = (q["model"] ?? "LAST_TOUCH") as "LAST_TOUCH" | "FIRST_TOUCH" | "LINEAR" | "TIME_DECAY" | "DATA_DRIVEN";

    const [agg] = await db()
      .select({
        totalAttributedRevenueCents: sql<string>`sum(attributed_revenue_cents)`,
      })
      .from(campaignAttributions)
      .where(
        and(
          eq(campaignAttributions.campaignId, id),
          eq(campaignAttributions.attributionModel, model)
        )
      );

    return reply.send({
      campaignId: id,
      model,
      totalAttributedRevenueCents: Number(agg?.totalAttributedRevenueCents ?? 0),
    });
  });

  // GET /measurement/campaigns/:id/roas
  app.get("/measurement/campaigns/:id/roas", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [r] = await db().select({
      rev: sql`sum(attributed_revenue_cents)`,
      spend: sql`sum(spend_cents)`,
    }).from(measurementRollups).where(eq(measurementRollups.campaignId, id));

    const roas = r?.spend && Number(r.spend) > 0 ? Number(r.rev) / Number(r.spend) : 0;

    return reply.send({ campaignId: id, roas });
  });

  // POST /measurement/events
  app.post("/measurement/events", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = IngestEventsBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const inserted = await db()
      .insert(revenueEvents)
      .values(
        body.data.events.map((e) => ({
          eventId: e.eventId,
          customerId: e.customerId,
          eventType: e.eventType,
          totalAmountCents: e.totalAmountCents,
          occurredAt: new Date(e.occurredAt),
          storeId: e.storeId,
          channel: e.channel,
          rawPayload: e.rawPayload,
        }))
      )
      .returning();

    await Promise.all(
      inserted.map((event, i) =>
        publishEvent(
          KAFKA_TOPICS.MEASUREMENT_REVENUE_RECEIVED,
          "measurement.revenue.received",
          {
            eventId: body.data.events[i]!.eventId,
            customerId: body.data.events[i]!.customerId,
            totalAmountCents: body.data.events[i]!.totalAmountCents,
          },
          body.data.events[i]!.eventId
        )
      )
    );

    return reply.send({ inserted: inserted.length });
  });

  // GET /measurement/campaigns/:id/lift
  app.get("/measurement/campaigns/:id/lift", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db()
      .select()
      .from(liftStudies)
      .where(and(eq(liftStudies.campaignId, id), isNull(liftStudies.deletedAt)))
      .orderBy(desc(liftStudies.createdAt));

    return reply.send({ data: rows });
  });
}
