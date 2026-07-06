import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";
import { ChannelSchema } from "./campaign";

export const BidStrategySchema = z.enum([
  "CPM",
  "CPC",
  "CPE",
  "TARGET_CPA",
  "MAXIMIZE_REACH",
  "MAXIMIZE_CONVERSIONS",
]);
export type BidStrategy = z.infer<typeof BidStrategySchema>;

export const TargetingConfigStatusSchema = z.enum([
  "DRAFT",
  "VALIDATED",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
]);
export type TargetingConfigStatus = z.infer<typeof TargetingConfigStatusSchema>;

export const TargetingConfigSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  audienceId: UuidSchema,
  channel: ChannelSchema,
  status: TargetingConfigStatusSchema,
  bidStrategy: BidStrategySchema,
  bidAmountCents: z.number().int().positive().nullable(),
  dailyBudgetCents: z.number().int().positive().nullable(),
  totalBudgetCents: z.number().int().positive().nullable(),
  estimatedReach: z.number().int().nonnegative().nullable(),
  estimatedCpm: z.number().int().nonnegative().nullable(),
});
export type TargetingConfig = z.infer<typeof TargetingConfigSchema>;

export const FrequencyCapSchema = BaseEntitySchema.extend({
  targetingConfigId: UuidSchema,
  capType: z.enum(["IMPRESSION", "CLICK", "SEND"]),
  maxCount: z.number().int().positive(),
  windowHours: z.number().int().positive(),
});
export type FrequencyCap = z.infer<typeof FrequencyCapSchema>;

export const GeoTargetSchema = BaseEntitySchema.extend({
  targetingConfigId: UuidSchema,
  geoType: z.enum(["STATE", "DMA", "ZIP_CODE", "STORE_RADIUS", "BANNER", "DIVISION"]),
  geoReferenceId: z.string(),
  includeOrExclude: z.enum(["INCLUDE", "EXCLUDE"]),
});
export type GeoTarget = z.infer<typeof GeoTargetSchema>;

export const DaypartScheduleSchema = BaseEntitySchema.extend({
  targetingConfigId: UuidSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
});
export type DaypartSchedule = z.infer<typeof DaypartScheduleSchema>;

export const SuppressionListSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  listType: z.enum(["OPTED_OUT", "RECENT_PURCHASERS", "COMPETITORS", "CUSTOM"]),
  audienceId: UuidSchema,
});
export type SuppressionList = z.infer<typeof SuppressionListSchema>;

export const TargetingValidationResultSchema = z.object({
  configId: UuidSchema,
  valid: z.boolean(),
  estimatedReach: z.number().int().nonnegative(),
  estimatedCpm: z.number().int().nonnegative(),
  reachDeviationPct: z.number().nullable(),
  issues: z.array(z.object({
    field: z.string(),
    severity: z.enum(["ERROR", "WARNING"]),
    message: z.string(),
  })),
});
export type TargetingValidationResult = z.infer<typeof TargetingValidationResultSchema>;
