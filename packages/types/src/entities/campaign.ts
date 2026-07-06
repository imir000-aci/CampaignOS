import { z } from "zod";
import { BaseEntitySchema, UuidSchema, TimestampSchema } from "./shared";

export const CampaignStatusSchema = z.enum([
  "DRAFT",
  "PLANNING",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "REJECTED",
  "CREATION_FAILED",
  "ARCHIVED",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignObjectiveSchema = z.enum([
  "AWARENESS",
  "CONSIDERATION",
  "CONVERSION",
  "RETENTION",
  "LOYALTY",
  "REACTIVATION",
]);
export type CampaignObjective = z.infer<typeof CampaignObjectiveSchema>;

export const ChannelSchema = z.enum([
  "EMAIL",
  "PUSH",
  "SMS",
  "PAID_SOCIAL",
  "PAID_SEARCH",
  "PROGRAMMATIC",
  "LANDING_PAGE",
  "IN_APP",
  "ORGANIC_SOCIAL",
]);
export type Channel = z.infer<typeof ChannelSchema>;

export const CampaignKpiSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  metricName: z.string().min(1),
  targetValue: z.number(),
  measurementWindowDays: z.number().int().positive(),
  unit: z.string().optional(),
});
export type CampaignKpi = z.infer<typeof CampaignKpiSchema>;

export const CampaignSchema = BaseEntitySchema.extend({
  externalId: z.string().optional(),
  name: z.string().min(1).max(255),
  status: CampaignStatusSchema,
  objective: CampaignObjectiveSchema,
  briefText: z.string().min(1),
  startDate: TimestampSchema,
  endDate: TimestampSchema,
  budgetTotalCents: z.number().int().positive(),
  budgetMediaCents: z.number().int().nonnegative(),
  budgetProductionCents: z.number().int().nonnegative(),
  ownerUserId: UuidSchema,
  divisionId: UuidSchema,
  bannerId: UuidSchema,
  channelMix: z.array(ChannelSchema).min(1),
  kpis: z.array(CampaignKpiSchema).optional(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const CreateCampaignSchema = CampaignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  status: true,
  kpis: true,
}).extend({
  kpis: z.array(
    CampaignKpiSchema.omit({ id: true, createdAt: true, updatedAt: true, campaignId: true })
  ).optional(),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const ApprovalGateTypeSchema = z.enum([
  "STRATEGY_REVIEW",
  "PREVIEW_REVIEW",
  "COMPLIANCE_REVIEW",
  "LAUNCH_REVIEW",
]);
export type ApprovalGateType = z.infer<typeof ApprovalGateTypeSchema>;

export const ApprovalGateStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ESCALATED",
  "TIMED_OUT",
]);
export type ApprovalGateStatus = z.infer<typeof ApprovalGateStatusSchema>;

export const ApprovalGateSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  gateType: ApprovalGateTypeSchema,
  status: ApprovalGateStatusSchema,
  approverUserId: UuidSchema.nullable(),
  rejectionReason: z.string().nullable(),
  escalationLevel: z.number().int().min(1).max(5),
  slaDeadlineAt: TimestampSchema.nullable(),
});
export type ApprovalGate = z.infer<typeof ApprovalGateSchema>;

export const PlanningSessionSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  supervisorThreadId: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "FAILED"]),
});
export type PlanningSession = z.infer<typeof PlanningSessionSchema>;

export const PlanningSessionMessageSchema = BaseEntitySchema.extend({
  sessionId: UuidSchema,
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  agentName: z.string().nullable(),
});
export type PlanningSessionMessage = z.infer<typeof PlanningSessionMessageSchema>;

export const CampaignActivitySchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  actorId: UuidSchema.nullable(),
  actorType: z.enum(["USER", "AGENT", "SYSTEM"]),
  actorName: z.string(),
  action: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type CampaignActivity = z.infer<typeof CampaignActivitySchema>;

export const LaunchChecklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["PENDING", "PASS", "FAIL", "WARN", "SKIPPED"]),
  details: z.string().optional(),
});
export type LaunchChecklistItem = z.infer<typeof LaunchChecklistItemSchema>;
