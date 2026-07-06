import { pgTable, varchar, integer, bigint, jsonb, uuid, pgEnum, real, boolean, vector, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baseColumns } from "../columns";

export const audienceTypeEnum = pgEnum("audience_type", [
  "RULE_BASED", "AI_GENERATED", "LOOKALIKE", "UPLOAD", "COMPOSITE",
]);

export const audienceStatusEnum = pgEnum("audience_status", [
  "DRAFT", "COMPUTING", "READY", "STALE", "ARCHIVED",
]);

export const audiences = pgTable("audiences", {
  ...baseColumns,
  name: varchar("name", { length: 500 }).notNull(),
  audienceType: audienceTypeEnum("audience_type").notNull(),
  status: audienceStatusEnum("status").notNull().default("DRAFT"),
  estimatedSize: integer("estimated_size"),
  ruleDefinition: jsonb("rule_definition"),
  seedAudienceId: uuid("seed_audience_id"),
  campaignId: uuid("campaign_id"),
  ownerUserId: uuid("owner_user_id").notNull(),
  divisionId: varchar("division_id", { length: 255 }),
  privacyFlags: jsonb("privacy_flags"),
});

export const audienceMembers = pgTable("audience_members", {
  ...baseColumns,
  audienceId: uuid("audience_id").notNull().references(() => audiences.id),
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  score: real("score"),
  includedAt: baseColumns.createdAt,
  excludedAt: baseColumns.deletedAt,
  source: varchar("source", { length: 100 }),
});

export const customerAttributes = pgTable("customer_attributes", {
  customerId: varchar("customer_id", { length: 255 }).primaryKey(),
  loyaltyTier: varchar("loyalty_tier", { length: 50 }),
  lifetimeValueCents: bigint("lifetime_value_cents", { mode: "number" }),
  daysSinceLastPurchase: integer("days_since_last_purchase"),
  preferredBannerId: varchar("preferred_banner_id", { length: 255 }),
  ageBand: varchar("age_band", { length: 50 }),
  hasChildren: boolean("has_children"),
  zipCode: varchar("zip_code", { length: 20 }),
  digitalEnrolled: boolean("digital_enrolled"),
  attributes: jsonb("attributes"),
  updatedAt: baseColumns.updatedAt,
});

export const customerEmbeddings = pgTable("customer_embeddings", {
  customerId: varchar("customer_id", { length: 255 }).primaryKey(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  modelVersion: varchar("model_version", { length: 100 }).notNull(),
  updatedAt: baseColumns.updatedAt,
});

export const audienceSchema = {
  audiences,
  audienceMembers,
  customerAttributes,
  customerEmbeddings,
};
