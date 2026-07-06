import { eq, and, isNull, desc, ilike, inArray, sql } from "drizzle-orm";
import {
  getServiceDb, strategySchema,
  campaigns, campaignKpis, campaignActivities, approvalGates, campaignDrafts,
} from "@campaignos/db-client";
import { publishEvent } from "@campaignos/kafka-client";
import { KAFKA_TOPICS } from "@campaignos/types";
import type { CampaignStatus } from "@campaignos/types";
import { isValidTransition, ACTION_MAP } from "../state-machine/transitions";
import { createLogger } from "@campaignos/otel";

const log = createLogger("strategy-platform");

function db() {
  return getServiceDb("POSTGRES_STRATEGY_URL", strategySchema);
}

export interface CampaignFilters {
  status?: CampaignStatus | CampaignStatus[];
  objective?: string;
  ownerUserId?: string;
  divisionId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  sort?: "created_at" | "updated_at" | "name";
  order?: "asc" | "desc";
}

export async function listCampaigns(filters: CampaignFilters) {
  const store = db();
  const limit = Math.min(filters.limit ?? 20, 100);

  const conditions = [isNull(campaigns.deletedAt)];
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(inArray(campaigns.status, statuses));
  }
  if (filters.ownerUserId) conditions.push(eq(campaigns.ownerUserId, filters.ownerUserId));
  if (filters.divisionId) conditions.push(eq(campaigns.divisionId, filters.divisionId));
  if (filters.q) conditions.push(ilike(campaigns.name, `%${filters.q}%`));

  const rows = await store
    .select()
    .from(campaigns)
    .where(and(...conditions))
    .orderBy(desc(campaigns.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  return {
    data,
    pagination: {
      hasMore,
      cursor: hasMore ? data[data.length - 1]?.id : null,
    },
  };
}

export async function getCampaign(id: string) {
  const store = db();
  const [campaign] = await store
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
    .limit(1);

  if (!campaign) return null;

  const kpis = await store
    .select()
    .from(campaignKpis)
    .where(and(eq(campaignKpis.campaignId, id), isNull(campaignKpis.deletedAt)));

  const [draft] = await store
    .select()
    .from(campaignDrafts)
    .where(eq(campaignDrafts.campaignId, id))
    .limit(1);

  return { ...campaign, kpis, draft: draft ?? null };
}

export interface CreateCampaignInput {
  name: string;
  objective: string;
  briefText?: string;
  startDate?: string;
  endDate?: string;
  budgetTotalCents?: number;
  budgetMediaCents?: number;
  budgetProductionCents?: number;
  channelMix?: string[];
  divisionId?: string;
  bannerId?: string;
  ownerUserId: string;
  kpis?: Array<{ metricName: string; targetValue: number; measurementWindowDays?: number; unit?: string }>;
}

export async function createCampaign(input: CreateCampaignInput) {
  const store = db();

  const [campaign] = await store
    .insert(campaigns)
    .values({
      name: input.name,
      objective: input.objective as never,
      briefText: input.briefText,
      startDate: input.startDate,
      endDate: input.endDate,
      budgetTotalCents: input.budgetTotalCents,
      budgetMediaCents: input.budgetMediaCents,
      budgetProductionCents: input.budgetProductionCents,
      channelMix: input.channelMix ?? [],
      divisionId: input.divisionId,
      bannerId: input.bannerId,
      ownerUserId: input.ownerUserId,
      status: "DRAFT",
    })
    .returning();

  if (!campaign) throw new Error("Campaign insert returned no rows");

  if (input.kpis?.length) {
    await store.insert(campaignKpis).values(
      input.kpis.map((k) => ({
        campaignId: campaign.id,
        metricName: k.metricName,
        targetValue: k.targetValue,
        measurementWindowDays: k.measurementWindowDays ?? 30,
        unit: k.unit,
      }))
    );
  }

  await store.insert(campaignDrafts).values({ campaignId: campaign.id });

  await publishEvent(
    KAFKA_TOPICS["campaign.created"],
    "campaign.created",
    { campaignId: campaign.id, name: campaign.name, status: campaign.status, ownerUserId: campaign.ownerUserId },
    campaign.id
  );

  log.info("Campaign created", { campaignId: campaign.id });
  return campaign;
}

export interface PatchCampaignInput {
  name?: string;
  briefText?: string;
  startDate?: string;
  endDate?: string;
  budgetTotalCents?: number;
  budgetMediaCents?: number;
  budgetProductionCents?: number;
  channelMix?: string[];
  divisionId?: string;
  bannerId?: string;
}

export async function patchCampaign(id: string, input: PatchCampaignInput) {
  const store = db();

  const [updated] = await store
    .update(campaigns)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
    .returning();

  if (!updated) return null;
  return updated;
}

export async function transitionCampaign(
  id: string,
  action: string,
  actorId: string,
  meta?: { rejectionReason?: string; temporalWorkflowId?: string }
) {
  const store = db();
  const targetStatus = ACTION_MAP[action];
  if (!targetStatus) throw new Error(`Unknown action: ${action}`);

  const [campaign] = await store
    .select({ id: campaigns.id, status: campaigns.status, name: campaigns.name })
    .from(campaigns)
    .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
    .limit(1);

  if (!campaign) return null;

  if (!isValidTransition(campaign.status as CampaignStatus, targetStatus)) {
    throw new Error(`Invalid transition: ${campaign.status} → ${targetStatus}`);
  }

  const updateSet: Record<string, unknown> = { status: targetStatus, updatedAt: new Date() };
  if (meta?.temporalWorkflowId) updateSet["temporalWorkflowId"] = meta.temporalWorkflowId;

  const [updated] = await store
    .update(campaigns)
    .set(updateSet as never)
    .where(eq(campaigns.id, id))
    .returning();

  await store.insert(campaignActivities).values({
    campaignId: id,
    actorId,
    actorType: "USER",
    action,
    previousStatus: campaign.status as CampaignStatus,
    newStatus: targetStatus,
    metadata: meta ?? {},
  });

  await publishEvent(
    KAFKA_TOPICS["campaign.status.changed"],
    "campaign.status.changed",
    {
      campaignId: id,
      previousStatus: campaign.status,
      newStatus: targetStatus,
      actorId,
    },
    id
  );

  if (targetStatus === "APPROVED") {
    await publishEvent(
      KAFKA_TOPICS["campaign.approved"],
      "campaign.approved",
      { campaignId: id, actorId },
      id
    );
  }

  log.info("Campaign transitioned", { campaignId: id, action, from: campaign.status, to: targetStatus });
  return updated;
}

export async function softDeleteCampaign(id: string) {
  const store = db();
  const [updated] = await store
    .update(campaigns)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
    .returning({ id: campaigns.id });
  return updated ?? null;
}

export async function duplicateCampaign(id: string, ownerUserId: string) {
  const existing = await getCampaign(id);
  if (!existing) return null;

  return createCampaign({
    name: `${existing.name} (copy)`,
    objective: existing.objective,
    briefText: existing.briefText ?? undefined,
    budgetTotalCents: existing.budgetTotalCents ?? undefined,
    budgetMediaCents: existing.budgetMediaCents ?? undefined,
    channelMix: existing.channelMix as string[] ?? [],
    divisionId: existing.divisionId ?? undefined,
    bannerId: existing.bannerId ?? undefined,
    ownerUserId,
    kpis: existing.kpis.map((k) => ({
      metricName: k.metricName,
      targetValue: k.targetValue,
      measurementWindowDays: k.measurementWindowDays,
      unit: k.unit ?? undefined,
    })),
  });
}

export async function getActivities(campaignId: string, limit = 50) {
  return db()
    .select()
    .from(campaignActivities)
    .where(eq(campaignActivities.campaignId, campaignId))
    .orderBy(desc(campaignActivities.createdAt))
    .limit(limit);
}
