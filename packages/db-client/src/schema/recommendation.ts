import { pgTable, varchar, integer, real, text, jsonb, uuid, pgEnum, vector } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const modelTypeEnum = pgEnum("recommendation_model_type", [
  "COLLABORATIVE_FILTERING", "CONTENT_BASED", "HYBRID", "RULES_BASED",
]);

export const modelStatusEnum = pgEnum("recommendation_model_status", [
  "TRAINING", "READY", "DEPRECATED",
]);

export const recommendationModels = pgTable("recommendation_models", {
  ...baseColumns,
  name: varchar("name", { length: 255 }).notNull(),
  modelType: modelTypeEnum("model_type").notNull(),
  version: integer("version").notNull(),
  status: modelStatusEnum("status").notNull().default("TRAINING"),
  modelArtifactKey: varchar("model_artifact_key", { length: 1000 }),
  evaluationMetrics: jsonb("evaluation_metrics"),
  trainingDataCutoff: baseColumns.updatedAt,
});

export const recommendationRequests = pgTable("recommendation_requests", {
  ...baseColumns,
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  contextType: varchar("context_type", { length: 100 }).notNull(),
  campaignId: uuid("campaign_id"),
  modelId: uuid("model_id").references(() => recommendationModels.id),
  inputContext: jsonb("input_context"),
  latencyMs: integer("latency_ms"),
});

export const recommendationItems = pgTable("recommendation_items", {
  ...baseColumns,
  requestId: uuid("request_id").notNull().references(() => recommendationRequests.id),
  productId: varchar("product_id", { length: 255 }),
  offerId: uuid("offer_id"),
  rank: integer("rank").notNull(),
  score: real("score").notNull(),
  reasonCode: varchar("reason_code", { length: 100 }),
  metadata: jsonb("metadata"),
});

export const productEmbeddings = pgTable("product_embeddings", {
  productId: varchar("product_id", { length: 255 }).primaryKey(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  modelVersion: varchar("model_version", { length: 100 }).notNull(),
  updatedAt: baseColumns.updatedAt,
});

export const offerEmbeddings = pgTable("offer_embeddings", {
  offerId: uuid("offer_id").primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  modelVersion: varchar("model_version", { length: 100 }).notNull(),
  updatedAt: baseColumns.updatedAt,
});

export const recommendationSchema = {
  recommendationModels,
  recommendationRequests,
  recommendationItems,
  productEmbeddings,
  offerEmbeddings,
};
