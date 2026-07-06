import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPermission } from "@campaignos/rbac";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import {
  listCampaigns, getCampaign, createCampaign, patchCampaign,
  transitionCampaign, softDeleteCampaign, duplicateCampaign, getActivities,
} from "../services/campaign.service";

const CreateBody = z.object({
  name: z.string().min(1).max(500),
  objective: z.enum(["AWARENESS", "CONSIDERATION", "CONVERSION", "RETENTION", "LOYALTY", "WINBACK"]),
  briefText: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetTotalCents: z.number().int().positive().optional(),
  budgetMediaCents: z.number().int().positive().optional(),
  budgetProductionCents: z.number().int().positive().optional(),
  channelMix: z.array(z.string()).optional(),
  divisionId: z.string().optional(),
  bannerId: z.string().optional(),
  kpis: z.array(z.object({
    metricName: z.string(),
    targetValue: z.number(),
    measurementWindowDays: z.number().int().optional(),
    unit: z.string().optional(),
  })).optional(),
});

const PatchBody = CreateBody.partial().omit({ objective: true });

const RejectBody = z.object({ reason: z.string().min(1) });

function getUser(request: { user: unknown }): JwtPayload {
  return request.user as JwtPayload;
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.get("/campaigns", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    const q = request.query as Record<string, string>;

    const result = await listCampaigns({
      status: q["status"] as never,
      ownerUserId: q["owner"] ?? undefined,
      divisionId: user.role === "ADMIN" ? q["division_id"] : user.division_ids[0],
      q: q["q"],
      limit: q["limit"] ? parseInt(q["limit"]) : 20,
    });

    return reply.send(result);
  });

  app.post("/campaigns", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "campaigns:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = CreateBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const campaign = await createCampaign({ ...body.data, ownerUserId: user.sub });
    return reply.status(201).send(campaign);
  });

  app.get("/campaigns/summary", { onRequest: [app.authenticate] }, async (_request, reply) => {
    // Aggregate KPIs — placeholder; measurement platform aggregates the real data
    return reply.send({ message: "See measurement-platform for campaign KPI aggregates" });
  });

  app.get("/campaigns/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await getCampaign(id);
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    return reply.send(campaign);
  });

  app.patch("/campaigns/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "campaigns:edit")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const body = PatchBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const updated = await patchCampaign(id, body.data);
    if (!updated) return reply.status(404).send({ error: "Campaign not found" });
    return reply.send(updated);
  });

  app.delete("/campaigns/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "campaigns:delete")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const deleted = await softDeleteCampaign(id);
    if (!deleted) return reply.status(404).send({ error: "Campaign not found" });
    return reply.status(204).send();
  });

  // Action sub-resources: POST /campaigns/:id/submit|approve|reject|launch|pause|resume|complete|archive
  const ACTIONS = ["submit", "approve", "reject", "launch", "pause", "resume", "complete", "archive"];

  for (const action of ACTIONS) {
    app.post(`/campaigns/:id/${action}`, { onRequest: [app.authenticate] }, async (request, reply) => {
      const user = getUser(request);
      const { id } = request.params as { id: string };

      let meta: { rejectionReason?: string } = {};
      if (action === "reject") {
        const body = RejectBody.safeParse(request.body);
        if (!body.success) {
          return reply.status(400).send({ error: "Rejection reason is required" });
        }
        meta = { rejectionReason: body.data.reason };
      }

      try {
        const updated = await transitionCampaign(id, action, user.sub, meta);
        if (!updated) return reply.status(404).send({ error: "Campaign not found" });
        return reply.send(updated);
      } catch (err) {
        return reply.status(409).send({ error: err instanceof Error ? err.message : "Transition failed" });
      }
    });
  }

  app.post("/campaigns/:id/duplicate", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "campaigns:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const { id } = request.params as { id: string };
    const copy = await duplicateCampaign(id, user.sub);
    if (!copy) return reply.status(404).send({ error: "Campaign not found" });
    return reply.status(201).send(copy);
  });

  app.get("/campaigns/:id/activities", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { limit?: string };
    const activities = await getActivities(id, q.limit ? parseInt(q.limit) : 50);
    return reply.send({ data: activities });
  });
}
