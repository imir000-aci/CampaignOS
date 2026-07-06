import { pgTable, varchar, integer, bigint, jsonb, uuid, pgEnum, boolean } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const offerTypeEnum = pgEnum("offer_type", [
  "PERCENT_OFF", "DOLLAR_OFF", "BOGO", "FREE_ITEM", "POINTS_MULTIPLIER",
]);

export const offerStatusEnum = pgEnum("offer_status", [
  "DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED",
]);

export const offers = pgTable("offers", {
  ...baseColumns,
  name: varchar("name", { length: 500 }).notNull(),
  offerType: offerTypeEnum("offer_type").notNull(),
  status: offerStatusEnum("status").notNull().default("DRAFT"),
  description: varchar("description", { length: 1000 }),
  discountValue: bigint("discount_value", { mode: "number" }).notNull(),
  minPurchaseCents: bigint("min_purchase_cents", { mode: "number" }),
  maxRedemptionsPerCustomer: integer("max_redemptions_per_customer"),
  budgetTotalCents: bigint("budget_total_cents", { mode: "number" }),
  budgetRemainingCents: bigint("budget_remaining_cents", { mode: "number" }),
  validFrom: baseColumns.createdAt,
  validUntil: baseColumns.deletedAt,
  externalOfferCode: varchar("external_offer_code", { length: 255 }),
  terms: varchar("terms", { length: 2000 }),
});

export const offerEligibilityRules = pgTable("offer_eligibility_rules", {
  ...baseColumns,
  offerId: uuid("offer_id").notNull().references(() => offers.id),
  ruleType: varchar("rule_type", { length: 100 }).notNull(),
  ruleValue: jsonb("rule_value").notNull(),
  includeOrExclude: boolean("include_or_exclude").notNull().default(true),
});

export const offerRedemptions = pgTable("offer_redemptions", {
  ...baseColumns,
  offerId: uuid("offer_id").notNull().references(() => offers.id),
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  revenueEventId: uuid("revenue_event_id"),
  discountAppliedCents: bigint("discount_applied_cents", { mode: "number" }).notNull(),
  channel: varchar("channel", { length: 100 }),
});

export const offerSchema = {
  offers,
  offerEligibilityRules,
  offerRedemptions,
};
