import { pgTable, varchar, integer, bigint, real, jsonb, uuid, pgEnum, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const attributionModelEnum = pgEnum("attribution_model", [
  "LAST_TOUCH", "FIRST_TOUCH", "LINEAR", "TIME_DECAY", "DATA_DRIVEN",
]);

export const liftStudyTypeEnum = pgEnum("lift_study_type", [
  "GEO_SPLIT", "CUSTOMER_HOLDOUT", "SYNTHETIC_CONTROL",
]);

export const revenueEvents = pgTable("revenue_events", {
  ...baseColumns,
  eventId: varchar("event_id", { length: 255 }).notNull().unique(),
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  storeId: varchar("store_id", { length: 255 }),
  transactionId: varchar("transaction_id", { length: 255 }),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  channel: varchar("channel", { length: 100 }),
  rawPayload: jsonb("raw_payload"),
});

export const revenueEventItems = pgTable("revenue_event_items", {
  ...baseColumns,
  revenueEventId: uuid("revenue_event_id").notNull().references(() => revenueEvents.id),
  productId: varchar("product_id", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  offerId: uuid("offer_id"),
  discountCents: bigint("discount_cents", { mode: "number" }),
});

export const campaignAttributions = pgTable("campaign_attributions", {
  ...baseColumns,
  revenueEventId: uuid("revenue_event_id").notNull().references(() => revenueEvents.id),
  campaignId: uuid("campaign_id").notNull(),
  experimentId: uuid("experiment_id"),
  variantId: uuid("variant_id"),
  attributionModel: attributionModelEnum("attribution_model").notNull(),
  attributedRevenueCents: bigint("attributed_revenue_cents", { mode: "number" }).notNull(),
  attributionWeight: real("attribution_weight").notNull().default(1.0),
  touchpoints: jsonb("touchpoints"),
});

export const measurementRollups = pgTable("measurement_rollups", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  rollupDate: date("rollup_date").notNull(),
  channel: varchar("channel", { length: 100 }).notNull(),
  impressions: bigint("impressions", { mode: "number" }).notNull().default(BigInt(0)),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  attributedRevenueCents: bigint("attributed_revenue_cents", { mode: "number" }).notNull().default(BigInt(0)),
  spend: bigint("spend_cents", { mode: "number" }),
  roas: real("roas"),
}, (t) => ({
  uniqueRollup: unique().on(t.campaignId, t.rollupDate, t.channel),
}));

export const liftStudies = pgTable("lift_studies", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  studyType: liftStudyTypeEnum("study_type").notNull(),
  controlGroupDefinition: jsonb("control_group_definition"),
  testGroupDefinition: jsonb("test_group_definition"),
  controlRevenueCents: bigint("control_revenue_cents", { mode: "number" }),
  testRevenueCents: bigint("test_revenue_cents", { mode: "number" }),
  incrementalLiftPct: real("incremental_lift_pct"),
  pValue: real("p_value"),
  isSignificant: boolean("is_significant"),
  studyPeriodStart: date("study_period_start"),
  studyPeriodEnd: date("study_period_end"),
});

export const kpiDefinitions = pgTable("kpi_definitions", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  formula: varchar("formula", { length: 1000 }),
  dataSources: jsonb("data_sources").$type<string[]>(),
  attributionModel: attributionModelEnum("attribution_model"),
  measurementWindowDays: integer("measurement_window_days"),
  anomalyThresholdPct: real("anomaly_threshold_pct"),
});

export const measurementSchema = {
  revenueEvents,
  revenueEventItems,
  campaignAttributions,
  measurementRollups,
  liftStudies,
  kpiDefinitions,
};
