import { pgTable, varchar, text, real, jsonb, uuid, pgEnum, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baseColumns } from "../columns";

export const experienceTypeEnum = pgEnum("experience_type", [
  "EMAIL", "PUSH", "SMS", "LANDING_PAGE", "IN_APP", "DISPLAY", "PAID_SOCIAL", "PAID_SEARCH",
]);

export const experienceStatusEnum = pgEnum("experience_status", [
  "DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED",
]);

export const slotTypeEnum = pgEnum("slot_type", [
  "HEADLINE", "BODY_COPY", "IMAGE", "CTA", "OFFER_REF", "PERSONALIZATION_TOKEN", "HTML_BLOCK",
]);

export const experiences = pgTable("experiences", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  experienceType: experienceTypeEnum("experience_type").notNull(),
  status: experienceStatusEnum("status").notNull().default("DRAFT"),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
});

export const experienceVariants = pgTable("experience_variants", {
  ...baseColumns,
  experienceId: uuid("experience_id").notNull().references(() => experiences.id),
  variantKey: varchar("variant_key", { length: 100 }).notNull(),
  isControl: boolean("is_control").notNull().default(false),
  weight: real("weight").notNull().default(0.5),
  name: varchar("name", { length: 255 }),
});

export const experienceSlots = pgTable("experience_slots", {
  ...baseColumns,
  experienceId: uuid("experience_id").notNull().references(() => experiences.id),
  variantId: uuid("variant_id").references(() => experienceVariants.id),
  slotKey: varchar("slot_key", { length: 100 }).notNull(),
  slotType: slotTypeEnum("slot_type").notNull(),
  contentValue: text("content_value"),
  creativeAssetId: uuid("creative_asset_id"),
  offerId: uuid("offer_id"),
  personalizationRule: jsonb("personalization_rule"),
});

export const experienceTemplates = pgTable("experience_templates", {
  ...baseColumns,
  name: varchar("name", { length: 500 }).notNull(),
  channel: experienceTypeEnum("channel").notNull(),
  baseHtml: text("base_html"),
  slotDefinitions: jsonb("slot_definitions").notNull().default(sql`'[]'::jsonb`),
  isGlobal: boolean("is_global").notNull().default(false),
  divisionId: varchar("division_id", { length: 255 }),
});

export const experienceSchema = {
  experiences,
  experienceVariants,
  experienceSlots,
  experienceTemplates,
};
