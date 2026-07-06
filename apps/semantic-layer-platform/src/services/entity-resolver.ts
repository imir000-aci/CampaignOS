import { eq, and, isNull, ilike, inArray } from "drizzle-orm";
import { getServiceDb, entityDefinitions, metricDefinitions, semanticSchema } from "@campaignos/db-client";
import type { EntityType } from "@campaignos/types";
import { createLogger } from "@campaignos/otel";

const log = createLogger("semantic-layer-platform");

function getDb() {
  return getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);
}

export interface ResolvedEntityResult {
  entityType: string;
  entityId: string;
  attributes: Record<string, unknown>;
  relationships: string[];
  ownerService: string;
}

export interface EntitySearchResult {
  entityType: string;
  entityId: string;
  displayName: string;
  attributes: Record<string, unknown>;
}

export async function searchEntities(
  entityType: string | undefined,
  query: string | undefined,
  limit = 20
): Promise<EntitySearchResult[]> {
  const db = getDb();

  const conditions = [isNull(entityDefinitions.deletedAt)];
  if (entityType) {
    conditions.push(eq(entityDefinitions.entityType, entityType as EntityType));
  }
  if (query) {
    conditions.push(ilike(entityDefinitions.name, `%${query}%`));
  }

  const rows = await db
    .select()
    .from(entityDefinitions)
    .where(and(...conditions))
    .limit(limit);

  return rows.map((r) => ({
    entityType: r.entityType,
    entityId: r.id,
    displayName: r.name,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  }));
}

export async function resolveEntity(
  entityType: string,
  entityId: string
): Promise<ResolvedEntityResult | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(entityDefinitions)
    .where(
      and(
        eq(entityDefinitions.entityType, entityType as EntityType),
        eq(entityDefinitions.id, entityId),
        isNull(entityDefinitions.deletedAt)
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    entityType: row.entityType,
    entityId: row.id,
    attributes: (row.attributes as Record<string, unknown>) ?? {},
    relationships: Object.keys((row.relationships as Record<string, unknown>) ?? {}),
    ownerService: row.ownerService,
  };
}

export interface BatchResolveItem {
  entityType: string;
  entityId: string;
}

export async function batchResolve(
  items: BatchResolveItem[]
): Promise<Map<string, ResolvedEntityResult | null>> {
  if (items.length === 0) return new Map();

  const db = getDb();
  const ids = items.map((i) => i.entityId);

  const rows = await db
    .select()
    .from(entityDefinitions)
    .where(and(inArray(entityDefinitions.id, ids), isNull(entityDefinitions.deletedAt)));

  const byId = new Map(rows.map((r) => [r.id, r]));

  const result = new Map<string, ResolvedEntityResult | null>();
  for (const item of items) {
    const key = `${item.entityType}:${item.entityId}`;
    const row = byId.get(item.entityId);
    if (!row || row.entityType !== item.entityType) {
      result.set(key, null);
    } else {
      result.set(key, {
        entityType: row.entityType,
        entityId: row.id,
        attributes: (row.attributes as Record<string, unknown>) ?? {},
        relationships: Object.keys((row.relationships as Record<string, unknown>) ?? {}),
        ownerService: row.ownerService,
      });
    }
  }
  return result;
}

export async function getMetricDefinitions(name?: string) {
  const db = getDb();
  const conditions = [isNull(metricDefinitions.deletedAt)];
  if (name) conditions.push(ilike(metricDefinitions.name, `%${name}%`));

  return db
    .select()
    .from(metricDefinitions)
    .where(and(...conditions))
    .limit(100);
}
