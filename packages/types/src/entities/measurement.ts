import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";
import { ChannelSchema } from "./campaign";

export const AttributionModelSchema = z.enum([
  "LAST_TOUCH",
  "FIRST_TOUCH",
  "LINEAR",
  "TIME_DECAY",
  "DATA_DRIVEN",
]);
export type AttributionModel = z.infer<typeof AttributionModelSchema>;

export const RevenueEventTypeSchema = z.enum([
  "IN_STORE_PURCHASE",
  "ONLINE_PURCHASE",
  "PICKUP_ORDER",
  "DELIVERY_ORDER",
]);
export type RevenueEventType = z.infer<typeof RevenueEventTypeSchema>;

export const RevenueEventSchema = BaseEntitySchema.extend({
  eventId: z.string(),
  customerId: UuidSchema,
  storeId: UuidSchema.nullable(),
  transactionId: z.string(),
  eventType: RevenueEventTypeSchema,
  totalAmountCents: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  channel: ChannelSchema.nullable(),
});
export type RevenueEvent = z.infer<typeof RevenueEventSchema>;

export const RevenueEventItemSchema = BaseEntitySchema.extend({
  revenueEventId: UuidSchema,
  productId: UuidSchema,
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().positive(),
  offerId: UuidSchema.nullable(),
});
export type RevenueEventItem = z.infer<typeof RevenueEventItemSchema>;

export const CampaignAttributionSchema = BaseEntitySchema.extend({
  revenueEventId: UuidSchema,
  campaignId: UuidSchema,
  experimentId: UuidSchema.nullable(),
  variantId: UuidSchema.nullable(),
  attributionModel: AttributionModelSchema,
  attributedRevenueCents: z.number().int().nonnegative(),
  touchpoints: z.array(z.object({
    channel: ChannelSchema,
    occurredAt: z.string().datetime({ offset: true }),
    weight: z.number().min(0).max(1),
  })),
});
export type CampaignAttribution = z.infer<typeof CampaignAttributionSchema>;

export const MeasurementRollupSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  rollupDate: z.string().date(),
  channel: ChannelSchema,
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  sends: z.number().int().nonnegative(),
  opens: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  attributedRevenueCents: z.number().int().nonnegative(),
  roas: z.number().nonnegative().nullable(),
  ctr: z.number().min(0).max(1).nullable(),
  cvr: z.number().min(0).max(1).nullable(),
});
export type MeasurementRollup = z.infer<typeof MeasurementRollupSchema>;

export const LiftStudySchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  studyType: z.enum(["GEO_HOLDOUT", "CUSTOMER_HOLDOUT", "TIME_SERIES"]),
  controlRevenueCents: z.number().int().nonnegative(),
  testRevenueCents: z.number().int().nonnegative(),
  incrementalRevenueCents: z.number().int(),
  incrementalLiftPct: z.number(),
  confidenceInterval: z.tuple([z.number(), z.number()]),
  isSignificant: z.boolean(),
});
export type LiftStudy = z.infer<typeof LiftStudySchema>;

export const CampaignMetricsSchema = z.object({
  campaignId: UuidSchema,
  period: z.object({ from: z.string().date(), to: z.string().date() }),
  timeseries: z.array(MeasurementRollupSchema),
  totals: z.object({
    impressions: z.number().int(),
    clicks: z.number().int(),
    conversions: z.number().int(),
    attributedRevenueCents: z.number().int(),
    roas: z.number().nullable(),
    ctr: z.number().nullable(),
    cvr: z.number().nullable(),
  }),
});
export type CampaignMetrics = z.infer<typeof CampaignMetricsSchema>;

export const KpiDefinitionSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  metricName: z.string(),
  formula: z.string().nullable(),
  unit: z.string(),
  attributionModel: AttributionModelSchema,
  attributionWindowDays: z.number().int().positive(),
  dataSources: z.array(z.string()),
});
export type KpiDefinition = z.infer<typeof KpiDefinitionSchema>;
