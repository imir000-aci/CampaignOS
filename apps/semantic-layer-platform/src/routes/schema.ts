import type { FastifyInstance } from "fastify";
import { getMetricDefinitions } from "../services/entity-resolver";
import { getServiceDb, entityDefinitions, metricDefinitions, semanticSchema } from "@campaignos/db-client";
import { isNull, eq } from "drizzle-orm";

const RELATIONSHIP_DEFINITIONS = [
  { from: "Customer", to: "Product", type: "PURCHASED", properties: ["quantity", "amount_cents", "occurred_at"] },
  { from: "Customer", to: "Offer", type: "REDEEMED", properties: ["redeemed_at", "discount_cents"] },
  { from: "Customer", to: "Audience", type: "MEMBER_OF", properties: ["score", "included_at"] },
  { from: "Customer", to: "Store", type: "SHOPS_AT", properties: ["frequency", "recency"] },
  { from: "Product", to: "Category", type: "IN_CATEGORY", properties: [] },
  { from: "Category", to: "Category", type: "SUBCATEGORY_OF", properties: [] },
  { from: "Product", to: "Product", type: "FREQUENTLY_BOUGHT_WITH", properties: ["co_purchase_count"] },
  { from: "Product", to: "Product", type: "SIMILAR_TO", properties: ["similarity_score"] },
  { from: "Campaign", to: "Audience", type: "TARGETS", properties: [] },
  { from: "Campaign", to: "Campaign", type: "DEPENDS_ON", properties: [] },
  { from: "Bundle", to: "Product", type: "CONTAINS_PRODUCT", properties: ["quantity", "required"] },
  { from: "Store", to: "Banner", type: "IN_BANNER", properties: [] },
  { from: "Banner", to: "Division", type: "PART_OF_DIVISION", properties: [] },
  { from: "Audience", to: "Audience", type: "DERIVED_FROM", properties: [] },
  { from: "Audience", to: "Audience", type: "SUPPRESSES", properties: [] },
];

export async function schemaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/semantic/schema", { onRequest: [app.authenticate] }, async (_request, reply) => {
    const db = getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);

    const entities = await db
      .select({
        entityType: entityDefinitions.entityType,
        name: entityDefinitions.name,
        description: entityDefinitions.description,
        ownerService: entityDefinitions.ownerService,
        attributes: entityDefinitions.attributes,
        version: entityDefinitions.version,
      })
      .from(entityDefinitions)
      .where(isNull(entityDefinitions.deletedAt));

    return reply.send({ entities, relationships: RELATIONSHIP_DEFINITIONS });
  });

  app.get("/semantic/metrics", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { q } = request.query as { q?: string };
    const metrics = await getMetricDefinitions(q);
    return reply.send({ data: metrics });
  });

  app.get("/semantic/metrics/:name", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const db = getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);

    const [metric] = await db
      .select()
      .from(metricDefinitions)
      .where(eq(metricDefinitions.name, name))
      .limit(1);

    if (!metric) return reply.status(404).send({ error: "Metric not found" });
    return reply.send(metric);
  });
}
