import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";

export const ExperimentTypeSchema = z.enum([
  "AB",
  "MULTIVARIATE",
  "HOLDOUT",
  "GEO_SPLIT",
]);
export type ExperimentType = z.infer<typeof ExperimentTypeSchema>;

export const ExperimentStatusSchema = z.enum([
  "DRAFT",
  "RUNNING",
  "PAUSED",
  "CONCLUDED",
  "INVALIDATED",
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

export const ExperimentSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  experienceId: UuidSchema,
  experimentType: ExperimentTypeSchema,
  status: ExperimentStatusSchema,
  name: z.string().min(1).max(255),
  hypothesis: z.string(),
  primaryMetric: z.string(),
  secondaryMetrics: z.array(z.string()),
  minimumDetectableEffect: z.number().positive(),
  confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
  plannedSampleSizePerCell: z.number().int().positive(),
  plannedDurationDays: z.number().int().positive(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  concludedAt: z.string().datetime({ offset: true }).nullable(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export const ExperimentVariantSchema = BaseEntitySchema.extend({
  experimentId: UuidSchema,
  experienceVariantId: UuidSchema,
  variantKey: z.string(),
  isControl: z.boolean(),
  allocationPct: z.number().positive().max(100),
  name: z.string(),
});
export type ExperimentVariant = z.infer<typeof ExperimentVariantSchema>;

export const ExperimentResultSchema = BaseEntitySchema.extend({
  experimentId: UuidSchema,
  variantId: UuidSchema,
  metricName: z.string(),
  sampleSize: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  conversionRate: z.number().min(0).max(1),
  pValue: z.number().min(0).max(1).nullable(),
  confidenceInterval: z.tuple([z.number(), z.number()]).nullable(),
  isSignificant: z.boolean().nullable(),
  upliftPct: z.number().nullable(),
  computedAt: z.string().datetime({ offset: true }),
});
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;

export const ExperimentAssignmentSchema = z.object({
  id: UuidSchema,
  experimentId: UuidSchema,
  customerId: UuidSchema,
  variantId: UuidSchema,
  assignedAt: z.string().datetime({ offset: true }),
});
export type ExperimentAssignment = z.infer<typeof ExperimentAssignmentSchema>;

export const PowerCalculationSchema = z.object({
  experimentId: UuidSchema,
  baselineConversionRate: z.number().min(0).max(1),
  minimumDetectableEffect: z.number().positive(),
  confidenceLevel: z.number().min(0.8).max(0.99),
  statisticalPower: z.number().min(0.5).max(1).default(0.8),
  requiredSampleSizePerCell: z.number().int().positive(),
  estimatedDurationDays: z.number().int().positive(),
});
export type PowerCalculation = z.infer<typeof PowerCalculationSchema>;
