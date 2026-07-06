import { pgTable, varchar, integer, real, text, jsonb, uuid, pgEnum, boolean, vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baseColumns } from "../columns";

export const assetTypeEnum = pgEnum("asset_type", [
  "IMAGE", "VIDEO", "HTML", "COPY", "AUDIO", "GIF",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "UPLOADING", "PROCESSING", "READY", "FAILED", "ARCHIVED",
]);

export const generationJobStatusEnum = pgEnum("generation_job_status", [
  "QUEUED", "PROCESSING", "COMPLETED", "FAILED",
]);

export const creativeAssets = pgTable("creative_assets", {
  ...baseColumns,
  name: varchar("name", { length: 500 }).notNull(),
  assetType: assetTypeEnum("asset_type").notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  minioBucket: varchar("minio_bucket", { length: 255 }),
  minioKey: varchar("minio_key", { length: 1000 }),
  status: assetStatusEnum("status").notNull().default("UPLOADING"),
  campaignId: uuid("campaign_id").notNull(),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  fileSizeBytes: integer("file_size_bytes"),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  generationJobId: uuid("generation_job_id"),
  channel: varchar("channel", { length: 100 }),
  approvedAt: baseColumns.updatedAt,
  approvedBy: uuid("approved_by"),
  rejectionReason: text("rejection_reason"),
});

export const assetAiMetadata = pgTable("asset_ai_metadata", {
  ...baseColumns,
  assetId: uuid("asset_id").notNull().references(() => creativeAssets.id).unique(),
  descriptionText: text("description_text"),
  detectedObjects: jsonb("detected_objects"),
  brandSafeScore: real("brand_safe_score"),
  dominantColors: jsonb("dominant_colors").$type<string[]>(),
  complianceNotes: jsonb("compliance_notes"),
  generationPrompt: text("generation_prompt"),
  generationModel: varchar("generation_model", { length: 100 }),
});

export const assetVersions = pgTable("asset_versions", {
  ...baseColumns,
  assetId: uuid("asset_id").notNull().references(() => creativeAssets.id),
  versionNumber: integer("version_number").notNull(),
  minioKey: varchar("minio_key", { length: 1000 }).notNull(),
  changeNote: text("change_note"),
  createdByUserId: uuid("created_by_user_id"),
});

export const generationJobs = pgTable("generation_jobs", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  status: generationJobStatusEnum("status").notNull().default("QUEUED"),
  jobType: varchar("job_type", { length: 100 }).notNull(),
  inputPrompt: text("input_prompt"),
  inputContext: jsonb("input_context"),
  outputAssetIds: jsonb("output_asset_ids").$type<string[]>().default(sql`'[]'::jsonb`),
  errorMessage: text("error_message"),
  modelUsed: varchar("model_used", { length: 100 }),
  tokensUsed: integer("tokens_used"),
  estimatedCostCents: integer("estimated_cost_cents"),
});

export const copyVariants = pgTable("copy_variants", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  channel: varchar("channel", { length: 100 }).notNull(),
  variantKey: varchar("variant_key", { length: 100 }).notNull(),
  headline: varchar("headline", { length: 500 }),
  bodyText: text("body_text"),
  callToAction: varchar("call_to_action", { length: 255 }),
  subjectLine: varchar("subject_line", { length: 500 }),
  previewText: varchar("preview_text", { length: 255 }),
  isApproved: boolean("is_approved").notNull().default(false),
  complianceScore: real("compliance_score"),
});

export const creativeEmbeddings = pgTable("creative_embeddings", {
  assetId: uuid("asset_id").primaryKey().references(() => creativeAssets.id),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  modality: varchar("modality", { length: 50 }).notNull(),
  modelVersion: varchar("model_version", { length: 100 }).notNull(),
  updatedAt: baseColumns.updatedAt,
});

export const creativeSchema = {
  creativeAssets,
  assetAiMetadata,
  assetVersions,
  generationJobs,
  copyVariants,
  creativeEmbeddings,
};
