import { runQuery } from "@campaignos/neo4j-client";
import { createLogger } from "@campaignos/otel";
import neo4j from "neo4j-driver";

const log = createLogger("semantic-layer-platform");

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GraphRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, unknown>;
}

export interface TraversalResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export async function traverseRelationships(
  entityType: string,
  entityId: string,
  depth = 1,
  relationshipTypes?: string[]
): Promise<TraversalResult> {
  const label = entityType.charAt(0).toUpperCase() + entityType.slice(1).toLowerCase();
  const relFilter = relationshipTypes?.length
    ? `:${relationshipTypes.join("|")}`
    : "";

  const cypher = `
    MATCH (start:${label} {id: $entityId})
    CALL apoc.path.subgraphAll(start, {
      relationshipFilter: "${relFilter}",
      minLevel: 1,
      maxLevel: $depth
    })
    YIELD nodes, relationships
    RETURN nodes, relationships
  `;

  try {
    const result = await runQuery(cypher, {
      entityId,
      depth: neo4j.int(depth),
    });

    if (result.records.length === 0) {
      return { nodes: [], relationships: [] };
    }

    const record = result.records[0];
    const rawNodes = record.get("nodes") as unknown[];
    const rawRels = record.get("relationships") as unknown[];

    const nodes: GraphNode[] = (rawNodes as Array<{ identity: unknown; labels: string[]; properties: Record<string, unknown> }>).map((n) => ({
      id: n.identity?.toString() ?? "",
      labels: n.labels,
      properties: n.properties,
    }));

    const relationships: GraphRelationship[] = (rawRels as Array<{ identity: unknown; type: string; start: unknown; end: unknown; properties: Record<string, unknown> }>).map((r) => ({
      id: r.identity?.toString() ?? "",
      type: r.type,
      startNodeId: r.start?.toString() ?? "",
      endNodeId: r.end?.toString() ?? "",
      properties: r.properties,
    }));

    return { nodes, relationships };
  } catch (err) {
    log.warn("Graph traversal failed, returning empty result", {
      error: err instanceof Error ? err.message : String(err),
      entityType,
      entityId,
    });
    return { nodes: [], relationships: [] };
  }
}

export async function findLookalikeCandidates(
  seedAudienceId: string,
  limit = 1000
): Promise<string[]> {
  const cypher = `
    MATCH (seed:Audience {id: $seedAudienceId})<-[:MEMBER_OF]-(c:Customer)
    WITH collect(DISTINCT c) AS seedCustomers
    UNWIND seedCustomers AS sc
    MATCH (sc)-[:PURCHASED]->(p:Product)<-[:PURCHASED]-(candidate:Customer)
    WHERE NOT (candidate)-[:MEMBER_OF]->(:Audience {id: $seedAudienceId})
    WITH candidate, count(DISTINCT p) AS overlap
    ORDER BY overlap DESC
    LIMIT $limit
    RETURN candidate.id AS customerId
  `;

  try {
    const result = await runQuery(cypher, {
      seedAudienceId,
      limit: neo4j.int(limit),
    });
    return result.records.map((r) => r.get("customerId") as string);
  } catch (err) {
    log.warn("Lookalike candidate query failed", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export async function getProductRecommendations(
  customerId: string,
  limit = 20
): Promise<Array<{ productId: string; score: number; reason: string }>> {
  const cypher = `
    MATCH (c:Customer {id: $customerId})-[:PURCHASED]->(p:Product)
    WITH c, collect(DISTINCT p) AS purchasedProducts
    UNWIND purchasedProducts AS pp
    MATCH (pp)-[r:FREQUENTLY_BOUGHT_WITH]->(candidate:Product)
    WHERE NOT candidate IN purchasedProducts
    WITH candidate, sum(r.co_purchase_count) AS score
    ORDER BY score DESC
    LIMIT $limit
    RETURN candidate.id AS productId, score, "co_purchase" AS reason
  `;

  try {
    const result = await runQuery(cypher, {
      customerId,
      limit: neo4j.int(limit),
    });
    return result.records.map((r) => ({
      productId: r.get("productId") as string,
      score: (r.get("score") as number) ?? 0,
      reason: r.get("reason") as string,
    }));
  } catch (err) {
    log.warn("Product recommendations query failed", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export async function checkOfferEligibility(
  customerId: string,
  offerId: string
): Promise<boolean> {
  const cypher = `
    MATCH (o:Offer {id: $offerId})-[:APPLIES_TO_CATEGORY]->(cat:Category)
    MATCH (c:Customer {id: $customerId})-[:PURCHASED]->(:Product)-[:IN_CATEGORY]->(pc:Category)
    WHERE pc = cat OR (pc)-[:SUBCATEGORY_OF*]->(cat)
    RETURN count(*) > 0 AS eligible
  `;

  try {
    const result = await runQuery(cypher, { customerId, offerId });
    if (result.records.length === 0) return false;
    return result.records[0].get("eligible") as boolean;
  } catch {
    return false;
  }
}
