import { pgTable, varchar, integer, bigint, jsonb, uuid, pgEnum, boolean } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const targetingStatusEnum = pgEnum("targeting_status", [
  "DRAFT", "ACTIVE", "PAUSED", "ARCHIVED",
]);

export const bidStrategyEnum = pgEnum("bid_strategy", [
  "CPM", "CPC", "CPA", "TARGET_ROAS", "MANUAL",
]);

export const geoTypeEnum = pgEnum("geo_type", [
  "COUNTRY", "STATE", "DMA", "CITY", "ZIP", "STORE_RADIUS", "DIVISION", "BANNER",
]);

export const targetingConfigs = pgTable("targeting_configs", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  audienceId: uuid("audience_id").notNull(),
  channel: varchar("channel", { length: 100 }).notNull(),
  status: targetingStatusEnum("status").notNull().default("DRAFT"),
  bidStrategy: bidStrategyEnum("bid_strategy").notNull(),
  bidAmountCents: bigint("bid_amount_cents", { mode: "number" }),
  dailyBudgetCents: bigint("daily_budget_cents", { mode: "number" }),
  totalBudgetCents: bigint("total_budget_cents", { mode: "number" }),
  estimatedReach: integer("estimated_reach"),
  estimatedImpressionsDaily: integer("estimated_impressions_daily"),
  platformConfig: jsonb("platform_config"),
});

export const frequencyCaps = pgTable("frequency_caps", {
  ...baseColumns,
  targetingConfigId: uuid("targeting_config_id").notNull().references(() => targetingConfigs.id),
  capType: varchar("cap_type", { length: 50 }).notNull(),
  maxCount: integer("max_count").notNull(),
  windowHours: integer("window_hours").notNull(),
});

export const suppressionLists = pgTable("suppression_lists", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  listType: varchar("list_type", { length: 100 }).notNull(),
  audienceId: uuid("audience_id"),
  description: varchar("description", { length: 500 }),
});

export const geoTargets = pgTable("geo_targets", {
  ...baseColumns,
  targetingConfigId: uuid("targeting_config_id").notNull().references(() => targetingConfigs.id),
  geoType: geoTypeEnum("geo_type").notNull(),
  geoReferenceId: varchar("geo_reference_id", { length: 255 }).notNull(),
  geoLabel: varchar("geo_label", { length: 255 }),
  includeOrExclude: boolean("include_or_exclude").notNull().default(true),
});

export const daypartSchedules = pgTable("daypart_schedules", {
  ...baseColumns,
  targetingConfigId: uuid("targeting_config_id").notNull().references(() => targetingConfigs.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startHour: integer("start_hour").notNull(),
  endHour: integer("end_hour").notNull(),
});

export const targetingSchema = {
  targetingConfigs,
  frequencyCaps,
  suppressionLists,
  geoTargets,
  daypartSchedules,
};
