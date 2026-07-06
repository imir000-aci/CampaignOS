import { pgTable, varchar, integer, real, jsonb, uuid, pgEnum, boolean, unique } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const experimentTypeEnum = pgEnum("experiment_type", [
  "AB", "MULTIVARIATE", "HOLDOUT", "GEO_SPLIT",
]);

export const experimentStatusEnum = pgEnum("experiment_status", [
  "DRAFT", "RUNNING", "PAUSED", "CONCLUDED", "INVALIDATED",
]);

export const experiments = pgTable("experiments", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  experienceId: uuid("experience_id"),
  experimentType: experimentTypeEnum("experiment_type").notNull(),
  status: experimentStatusEnum("status").notNull().default("DRAFT"),
  name: varchar("name", { length: 500 }).notNull(),
  hypothesis: varchar("hypothesis", { length: 1000 }),
  primaryMetric: varchar("primary_metric", { length: 255 }).notNull(),
  secondaryMetrics: jsonb("secondary_metrics").$type<string[]>(),
  minimumDetectableEffect: real("minimum_detectable_effect"),
  confidenceLevel: real("confidence_level").notNull().default(0.95),
  statisticalPower: real("statistical_power").notNull().default(0.8),
  estimatedSampleSizePerCell: integer("estimated_sample_size_per_cell"),
  estimatedDurationDays: integer("estimated_duration_days"),
});

export const experimentVariants = pgTable("experiment_variants", {
  ...baseColumns,
  experimentId: uuid("experiment_id").notNull().references(() => experiments.id),
  variantKey: varchar("variant_key", { length: 100 }).notNull(),
  isControl: boolean("is_control").notNull().default(false),
  allocationPct: real("allocation_pct").notNull(),
  experienceVariantId: uuid("experience_variant_id"),
});

export const experimentAssignments = pgTable("experiment_assignments", {
  ...baseColumns,
  experimentId: uuid("experiment_id").notNull().references(() => experiments.id),
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  variantId: uuid("variant_id").notNull().references(() => experimentVariants.id),
}, (t) => ({
  uniqueAssignment: unique().on(t.experimentId, t.customerId),
}));

export const experimentResults = pgTable("experiment_results", {
  ...baseColumns,
  experimentId: uuid("experiment_id").notNull().references(() => experiments.id),
  variantId: uuid("variant_id").notNull().references(() => experimentVariants.id),
  metricName: varchar("metric_name", { length: 255 }).notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  totalRevenueCents: jsonb("total_revenue_cents"),
  pValue: real("p_value"),
  confidenceIntervalLow: real("confidence_interval_low"),
  confidenceIntervalHigh: real("confidence_interval_high"),
  isSignificant: boolean("is_significant"),
  upliftPct: real("uplift_pct"),
  computedAt: baseColumns.updatedAt,
});

export const experimentSchema = {
  experiments,
  experimentVariants,
  experimentAssignments,
  experimentResults,
};
