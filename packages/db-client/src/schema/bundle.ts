import { pgTable, varchar, integer, bigint, boolean, jsonb, uuid, pgEnum } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const bundleStatusEnum = pgEnum("bundle_status", [
  "DRAFT", "ACTIVE", "ARCHIVED",
]);

export const bundles = pgTable("bundles", {
  ...baseColumns,
  name: varchar("name", { length: 500 }).notNull(),
  status: bundleStatusEnum("status").notNull().default("DRAFT"),
  description: varchar("description", { length: 1000 }),
  bundleType: varchar("bundle_type", { length: 100 }),
  pricingRule: jsonb("pricing_rule"),
  savingsAmountCents: bigint("savings_amount_cents", { mode: "number" }),
  campaignId: uuid("campaign_id"),
  seasonalTag: varchar("seasonal_tag", { length: 100 }),
});

export const bundleProducts = pgTable("bundle_products", {
  ...baseColumns,
  bundleId: uuid("bundle_id").notNull().references(() => bundles.id),
  productId: varchar("product_id", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  isRequired: boolean("is_required").notNull().default(true),
  substituteProductIds: jsonb("substitute_product_ids").$type<string[]>(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const bundleOffers = pgTable("bundle_offers", {
  ...baseColumns,
  bundleId: uuid("bundle_id").notNull().references(() => bundles.id),
  offerId: uuid("offer_id").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
});

export const bundleSchema = {
  bundles,
  bundleProducts,
  bundleOffers,
};
