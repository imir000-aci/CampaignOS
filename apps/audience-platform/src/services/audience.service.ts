import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { getServiceDb, audienceSchema, audiences, audienceMembers } from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import type { RuleGroup } from "@campaignos/types";
import { estimateAudienceSize, previewAudience } from "./rule-evaluator";
import { createLogger } from "@campaignos/otel";

const log = createLogger("audience-platform");

function db() {
  return getServiceDb("POSTGRES_AUDIENCE_URL", audienceSchema);
}

export interface CreateAudienceInput {
  name: string;
  audienceType: string;
  campaignId?: string;
  ruleDefinition?: RuleGroup;
  seedAudienceId?: string;
  ownerUserId: string;
  divisionId?: string;
}

export async function createAudience(input: CreateAudienceInput) {
  const store = db();

  let estimatedSize: number | undefined;
  if (input.ruleDefinition) {
    try {
      estimatedSize = await estimateAudienceSize(input.ruleDefinition);
    } catch {
      log.warn("Audience size estimation failed on create, proceeding without estimate");
    }
  }

  const [audience] = await store
    .insert(audiences)
    .values({
      name: input.name,
      audienceType: input.audienceType as never,
      campaignId: input.campaignId,
      ruleDefinition: input.ruleDefinition,
      seedAudienceId: input.seedAudienceId,
      ownerUserId: input.ownerUserId,
      divisionId: input.divisionId,
      estimatedSize,
      status: "DRAFT",
    })
    .returning();

  if (!audience) throw new Error("Audience insert returned no rows");

  await publishEvent(
    KAFKA_TOPICS["audience.computed"],
    "audience.computed",
    { audienceId: audience.id, estimatedSize: estimatedSize ?? 0, audienceType: audience.audienceType },
    audience.id
  );

  log.info("Audience created", { audienceId: audience.id });
  return audience;
}

export async function getAudience(id: string) {
  const [audience] = await db()
    .select()
    .from(audiences)
    .where(and(eq(audiences.id, id), isNull(audiences.deletedAt)))
    .limit(1);
  return audience ?? null;
}

export async function listAudiences(filters: { campaignId?: string; status?: string; ownerUserId?: string; limit?: number }) {
  const store = db();
  const conditions = [isNull(audiences.deletedAt)];
  if (filters.campaignId) conditions.push(eq(audiences.campaignId, filters.campaignId));
  if (filters.ownerUserId) conditions.push(eq(audiences.ownerUserId, filters.ownerUserId));

  return store
    .select()
    .from(audiences)
    .where(and(...conditions))
    .orderBy(desc(audiences.createdAt))
    .limit(Math.min(filters.limit ?? 20, 100));
}

export async function updateAudience(id: string, input: Partial<CreateAudienceInput>) {
  const store = db();

  let estimatedSize: number | undefined;
  if (input.ruleDefinition) {
    estimatedSize = await estimateAudienceSize(input.ruleDefinition).catch(() => undefined);
  }

  const [updated] = await store
    .update(audiences)
    .set({
      ...(input.name && { name: input.name }),
      ...(input.ruleDefinition && { ruleDefinition: input.ruleDefinition }),
      ...(estimatedSize !== undefined && { estimatedSize }),
      status: "DRAFT",
      updatedAt: new Date(),
    })
    .where(and(eq(audiences.id, id), isNull(audiences.deletedAt)))
    .returning();

  return updated ?? null;
}

export async function deleteAudience(id: string) {
  const [deleted] = await db()
    .update(audiences)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(audiences.id, id), isNull(audiences.deletedAt)))
    .returning({ id: audiences.id });
  return deleted ?? null;
}

export async function getAudienceSize(id: string) {
  const audience = await getAudience(id);
  if (!audience) return null;

  if (audience.ruleDefinition) {
    const fresh = await estimateAudienceSize(audience.ruleDefinition as RuleGroup);
    await db()
      .update(audiences)
      .set({ estimatedSize: fresh, updatedAt: new Date() })
      .where(eq(audiences.id, id));
    return fresh;
  }

  return audience.estimatedSize ?? 0;
}

export async function previewAudienceById(id: string) {
  const audience = await getAudience(id);
  if (!audience) return null;
  if (!audience.ruleDefinition) {
    return { estimatedSize: audience.estimatedSize ?? 0, sampleCustomers: [], demographicBreakdown: { byLoyaltyTier: {}, byAgeBand: {}, digitalEnrolledPct: 0 } };
  }
  return previewAudience(audience.ruleDefinition as RuleGroup);
}

export async function estimateUnsaved(ruleDefinition: RuleGroup) {
  return estimateAudienceSize(ruleDefinition);
}
