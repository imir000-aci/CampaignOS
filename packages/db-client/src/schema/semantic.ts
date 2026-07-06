import { pgTable, varchar, text, jsonb, uuid, pgEnum, vector, boolean, integer } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const entityTypeEnum = pgEnum("semantic_entity_type", [
  "CUSTOMER", "PRODUCT", "OFFER", "CAMPAIGN", "STORE",
  "DIVISION", "BANNER", "CATEGORY", "AUDIENCE",
]);

export const entityDefinitions = pgTable("entity_definitions", {
  ...baseColumns,
  entityType: entityTypeEnum("entity_type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  attributes: jsonb("attributes").notNull(),
  relationships: jsonb("relationships").notNull(),
  ownerService: varchar("owner_service", { length: 100 }).notNull(),
  version: integer("version").notNull().default(1),
});

export const metricDefinitions = pgTable("metric_definitions", {
  ...baseColumns,
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  description: text("description"),
  formula: text("formula"),
  unit: varchar("unit", { length: 50 }),
  dataSources: jsonb("data_sources").$type<string[]>(),
  relatedEntityTypes: jsonb("related_entity_types").$type<string[]>(),
  sqlTemplate: text("sql_template"),
  isPublic: boolean("is_public").notNull().default(true),
});

export const nlQueryHistory = pgTable("nl_query_history", {
  ...baseColumns,
  userId: uuid("user_id").notNull(),
  naturalLanguage: text("natural_language").notNull(),
  generatedSql: text("generated_sql"),
  isValid: boolean("is_valid"),
  resultRowCount: integer("result_row_count"),
  feedbackPositive: boolean("feedback_positive"),
  errorMessage: text("error_message"),
});

export const campaignBriefEmbeddings = pgTable("campaign_brief_embeddings", {
  campaignId: uuid("campaign_id").primaryKey(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  briefText: text("brief_text").notNull(),
  modelVersion: varchar("model_version", { length: 100 }).notNull(),
  updatedAt: baseColumns.updatedAt,
});

export const humanFeedbackEmbeddings = pgTable("human_feedback_embeddings", {
  gateId: uuid("gate_id").primaryKey(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  feedbackText: text("feedback_text").notNull(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  decision: varchar("decision", { length: 50 }).notNull(),
  modelVersion: varchar("model_version", { length: 100 }).notNull(),
  updatedAt: baseColumns.updatedAt,
});

export const semanticSchema = {
  entityDefinitions,
  metricDefinitions,
  nlQueryHistory,
  campaignBriefEmbeddings,
  humanFeedbackEmbeddings,
};
