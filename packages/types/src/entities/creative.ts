import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";
import { ChannelSchema } from "./campaign";

export const AssetTypeSchema = z.enum(["IMAGE", "VIDEO", "HTML", "COPY", "AUDIO"]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetStatusSchema = z.enum([
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
  "ARCHIVED",
]);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const CreativeAssetSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  assetType: AssetTypeSchema,
  mimeType: z.string(),
  minioBucket: z.string(),
  minioKey: z.string(),
  status: AssetStatusSchema,
  campaignId: UuidSchema.nullable(),
  widthPx: z.number().int().positive().nullable(),
  heightPx: z.number().int().positive().nullable(),
  fileSizeBytes: z.number().int().positive().nullable(),
  channel: ChannelSchema.nullable(),
  isApproved: z.boolean().default(false),
  approvedByUserId: UuidSchema.nullable(),
  rejectionReason: z.string().nullable(),
  versionNumber: z.number().int().positive().default(1),
  parentAssetId: UuidSchema.nullable(),
});
export type CreativeAsset = z.infer<typeof CreativeAssetSchema>;

export const AssetAiMetadataSchema = BaseEntitySchema.extend({
  assetId: UuidSchema,
  descriptionText: z.string().nullable(),
  detectedObjects: z.array(z.string()),
  brandSafeScore: z.number().min(0).max(1).nullable(),
  dominantColors: z.array(z.string()),
  complianceFlags: z.array(z.object({
    category: z.string(),
    severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
    description: z.string(),
  })),
});
export type AssetAiMetadata = z.infer<typeof AssetAiMetadataSchema>;

// Copy variant structure used by CreativeAgent output
export const CopyVariantSchema = z.object({
  variantKey: z.string(),
  channel: ChannelSchema,
  headline: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  characterCounts: z.object({
    headline: z.number().int(),
    body: z.number().int(),
    cta: z.number().int(),
  }).optional(),
});
export type CopyVariant = z.infer<typeof CopyVariantSchema>;

export const GenerationJobStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type GenerationJobStatus = z.infer<typeof GenerationJobStatusSchema>;

export const GenerationJobSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  status: GenerationJobStatusSchema,
  prompt: z.string(),
  modelUsed: z.string().nullable(),
  assetIds: z.array(UuidSchema),
  errorMessage: z.string().nullable(),
  estimatedTokens: z.number().int().nullable(),
  actualCostUsd: z.number().nullable(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export const TriggerGenerationSchema = z.object({
  campaignId: UuidSchema,
  prompt: z.string().min(1),
  assetType: AssetTypeSchema,
  channel: ChannelSchema,
  variantCount: z.number().int().min(1).max(5).default(3),
  referenceAssetId: UuidSchema.optional(),
});
export type TriggerGenerationInput = z.infer<typeof TriggerGenerationSchema>;
