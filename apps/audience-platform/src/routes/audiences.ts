import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPermission } from "@campaignos/rbac";
import { RuleGroupSchema } from "@campaignos/types";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import {
  createAudience, getAudience, listAudiences, updateAudience,
  deleteAudience, getAudienceSize, previewAudienceById, estimateUnsaved,
} from "../services/audience.service";

const CreateBody = z.object({
  name: z.string().min(1).max(500),
  audienceType: z.enum(["RULE_BASED", "AI_GENERATED", "LOOKALIKE", "UPLOAD", "COMPOSITE"]),
  campaignId: z.string().uuid().optional(),
  ruleDefinition: RuleGroupSchema.optional(),
  seedAudienceId: z.string().uuid().optional(),
  divisionId: z.string().optional(),
});

const EstimateBody = z.object({ ruleDefinition: RuleGroupSchema });

function getUser(r: { user: unknown }): JwtPayload {
  return r.user as JwtPayload;
}

export async function audienceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audiences", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    const q = request.query as Record<string, string>;
    const rows = await listAudiences({
      campaignId: q["campaign_id"],
      ownerUserId: user.role === "ADMIN" ? q["owner"] : user.sub,
      limit: q["limit"] ? parseInt(q["limit"]) : 20,
    });
    return reply.send({ data: rows });
  });

  app.post("/audiences", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "audiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const body = CreateBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const audience = await createAudience({ ...body.data, ownerUserId: user.sub });
    return reply.status(201).send(audience);
  });

  app.get("/audiences/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const audience = await getAudience(id);
    if (!audience) return reply.status(404).send({ error: "Audience not found" });
    return reply.send(audience);
  });

  app.put("/audiences/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "audiences:edit")) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const { id } = request.params as { id: string };
    const body = CreateBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });

    const updated = await updateAudience(id, { ...body.data, ownerUserId: user.sub });
    if (!updated) return reply.status(404).send({ error: "Audience not found" });
    return reply.send(updated);
  });

  app.delete("/audiences/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "audiences:edit")) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const { id } = request.params as { id: string };
    const deleted = await deleteAudience(id);
    if (!deleted) return reply.status(404).send({ error: "Audience not found" });
    return reply.status(204).send();
  });

  app.post("/audiences/:id/preview", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const preview = await previewAudienceById(id);
    if (!preview) return reply.status(404).send({ error: "Audience not found" });
    return reply.send(preview);
  });

  app.get("/audiences/:id/size", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const size = await getAudienceSize(id);
    if (size === null) return reply.status(404).send({ error: "Audience not found" });
    return reply.send({ size });
  });

  app.post("/audiences/estimate", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = EstimateBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    const size = await estimateUnsaved(body.data.ruleDefinition);
    return reply.send({ estimatedSize: size });
  });
}
