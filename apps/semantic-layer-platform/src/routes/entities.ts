import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchEntities, resolveEntity, batchResolve } from "../services/entity-resolver";
import { traverseRelationships } from "../services/graph-traversal";

const ResolveBody = z.object({
  items: z.array(
    z.object({ entityType: z.string(), entityId: z.string() })
  ).min(1).max(100),
});

export async function entityRoutes(app: FastifyInstance): Promise<void> {
  // GET /semantic/entities?type=CAMPAIGN&q=summer&limit=20
  app.get("/semantic/entities", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { type, q, limit } = request.query as { type?: string; q?: string; limit?: string };
    const results = await searchEntities(type, q, limit ? parseInt(limit) : 20);
    return reply.send({ data: results });
  });

  // GET /semantic/entities/:type/:id
  app.get("/semantic/entities/:type/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const entity = await resolveEntity(type.toUpperCase(), id);
    if (!entity) return reply.status(404).send({ error: "Entity not found" });
    return reply.send(entity);
  });

  // POST /semantic/resolve — batch resolution
  app.post("/semantic/resolve", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = ResolveBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const resultMap = await batchResolve(body.data.items);
    const results = body.data.items.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      resolved: resultMap.get(`${item.entityType}:${item.entityId}`) ?? null,
    }));

    return reply.send({ data: results });
  });

  // GET /semantic/relationships/:type/:id?depth=1&rel=PURCHASED,MEMBER_OF
  app.get("/semantic/relationships/:type/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const { depth, rel } = request.query as { depth?: string; rel?: string };

    const depthNum = Math.min(parseInt(depth ?? "1"), 3);
    const relTypes = rel ? rel.split(",").map((r) => r.trim()).filter(Boolean) : undefined;

    const result = await traverseRelationships(type, id, depthNum, relTypes);
    return reply.send(result);
  });
}
