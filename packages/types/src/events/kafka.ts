import { z } from "zod";
import { UuidSchema, TimestampSchema } from "../entities/shared";
import { CampaignStatusSchema } from "../entities/campaign";
import { AudienceStatusSchema } from "../entities/audience";
import { AssetStatusSchema } from "../entities/creative";
import { ActivationRequestStatusSchema, ActivationPlatformSchema } from "../entities/activation";

// ─── Envelope ────────────────────────────────────────────────────────────────────

export const KafkaEventEnvelopeSchema = z.object({
  eventId: UuidSchema,
  eventType: z.string(),
  occurredAt: TimestampSchema,
  version: z.number().int().positive(),
  data: z.record(z.unknown()),
});
export type KafkaEventEnvelope = z.infer<typeof KafkaEventEnvelopeSchema>;

// ─── Topic Constants ─────────────────────────────────────────────────────────────

export const KAFKA_TOPICS = {
  // Campaign
  CAMPAIGN_CREATED: "campaign.created",
  CAMPAIGN_STATUS_CHANGED: "campaign.status.changed",
  CAMPAIGN_APPROVED: "campaign.approved",
  CAMPAIGN_BRIEF_SUBMITTED: "campaign.brief.submitted",
  CAMPAIGN_OPTIMIZATION_APPLIED: "campaign.optimization.applied",

  // Audience
  AUDIENCE_COMPUTED: "audience.computed",
  AUDIENCE_MEMBER_ADDED: "audience.member.added",
  AUDIENCE_MEMBER_REMOVED: "audience.member.removed",

  // Creative
  CREATIVE_ASSET_PROCESSED: "creative.asset.processed",
  CREATIVE_ASSET_APPROVED: "creative.asset.approved",

  // Offer
  OFFER_REDEEMED: "offer.redeemed",
  OFFER_BUDGET_EXHAUSTED: "offer.budget.exhausted",
  OFFER_STATUS_CHANGED: "offer.status.changed",

  // Activation
  ACTIVATION_JOB_COMPLETED: "activation.job.completed",
  ACTIVATION_EVENTS_TRACKED: "activation.events.tracked",

  // Measurement
  MEASUREMENT_REVENUE_RECEIVED: "measurement.revenue.received",
  MEASUREMENT_ATTRIBUTION_COMPUTED: "measurement.attribution.computed",

  // Experiment
  EXPERIMENT_CONCLUDED: "experiment.concluded",

  // Agent
  AGENT_RUN_COMPLETED: "agent.run.completed",
  AGENT_TELEMETRY: "agent.telemetry",

  // Catalog projections (upstream systems)
  CATALOG_PRODUCT_UPDATED: "catalog.product.updated",
  CATALOG_STORE_UPDATED: "catalog.store.updated",
  CATALOG_BANNER_UPDATED: "catalog.banner.updated",
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

// ─── Typed Event Payloads ─────────────────────────────────────────────────────────

export const CampaignCreatedPayloadSchema = z.object({
  campaignId: UuidSchema,
  ownerUserId: UuidSchema,
  divisionId: UuidSchema,
  bannerId: UuidSchema,
  name: z.string(),
  objective: z.string(),
});
export type CampaignCreatedPayload = z.infer<typeof CampaignCreatedPayloadSchema>;

export const CampaignStatusChangedPayloadSchema = z.object({
  campaignId: UuidSchema,
  fromStatus: CampaignStatusSchema,
  toStatus: CampaignStatusSchema,
  changedByUserId: UuidSchema.nullable(),
  reason: z.string().nullable(),
});
export type CampaignStatusChangedPayload = z.infer<typeof CampaignStatusChangedPayloadSchema>;

export const AudienceComputedPayloadSchema = z.object({
  audienceId: UuidSchema,
  status: AudienceStatusSchema,
  estimatedSize: z.number().int().nonnegative(),
  computedAt: TimestampSchema,
});
export type AudienceComputedPayload = z.infer<typeof AudienceComputedPayloadSchema>;

export const CreativeAssetProcessedPayloadSchema = z.object({
  assetId: UuidSchema,
  campaignId: UuidSchema.nullable(),
  status: AssetStatusSchema,
  assetType: z.string(),
  minioBucket: z.string(),
  minioKey: z.string(),
});
export type CreativeAssetProcessedPayload = z.infer<typeof CreativeAssetProcessedPayloadSchema>;

export const OfferRedeemedPayloadSchema = z.object({
  redemptionId: UuidSchema,
  offerId: UuidSchema,
  customerId: UuidSchema,
  revenueEventId: UuidSchema,
  discountAppliedCents: z.number().int().positive(),
});
export type OfferRedeemedPayload = z.infer<typeof OfferRedeemedPayloadSchema>;

export const ActivationJobCompletedPayloadSchema = z.object({
  activationRequestId: UuidSchema,
  campaignId: UuidSchema,
  platform: ActivationPlatformSchema,
  status: ActivationRequestStatusSchema,
  deliveryStats: z.record(z.number().int().nonnegative()).optional(),
});
export type ActivationJobCompletedPayload = z.infer<typeof ActivationJobCompletedPayloadSchema>;

export const AgentTelemetryPayloadSchema = z.object({
  runId: UuidSchema,
  agentName: z.string(),
  campaignId: UuidSchema,
  latencyMs: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  schemaValid: z.boolean(),
  iterationCount: z.number().int().nonnegative(),
  overallScore: z.number().nullable(),
  humanGateOutcome: z.enum(["APPROVED", "REJECTED", "APPROVED_WITH_COMMENTS"]).nullable(),
  error: z.string().nullable(),
  stubMode: z.boolean(),
});
export type AgentTelemetryPayload = z.infer<typeof AgentTelemetryPayloadSchema>;
