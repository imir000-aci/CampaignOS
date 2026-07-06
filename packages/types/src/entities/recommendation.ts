import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";

export const RecommendationModelTypeSchema = z.enum([
  "COLLABORATIVE_FILTERING",
  "CONTENT_BASED",
  "HYBRID",
  "POPULARITY",
  "BANDIT",
]);
export type RecommendationModelType = z.infer<typeof RecommendationModelTypeSchema>;

export const RecommendationContextTypeSchema = z.enum([
  "HOMEPAGE",
  "CART_UPSELL",
  "POST_PURCHASE",
  "CAMPAIGN_OFFER",
  "BROWSE_AFFINITY",
  "WEEKLY_AD",
]);
export type RecommendationContextType = z.infer<typeof RecommendationContextTypeSchema>;

export const RecommendationModelSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  modelType: RecommendationModelTypeSchema,
  version: z.string(),
  status: z.enum(["TRAINING", "READY", "DEPRECATED"]),
  modelArtifactKey: z.string().nullable(),
  trainedAt: z.string().datetime({ offset: true }).nullable(),
  metrics: z.object({
    hitRate: z.number().nullable(),
    ndcg: z.number().nullable(),
    coveragePct: z.number().nullable(),
  }).nullable(),
});
export type RecommendationModel = z.infer<typeof RecommendationModelSchema>;

export const RecommendationRequestSchema = BaseEntitySchema.extend({
  customerId: UuidSchema,
  contextType: RecommendationContextTypeSchema,
  campaignId: UuidSchema.nullable(),
  modelId: UuidSchema,
  requestedAt: z.string().datetime({ offset: true }),
  count: z.number().int().positive().default(10),
});
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;

export const RecommendationItemSchema = BaseEntitySchema.extend({
  requestId: UuidSchema,
  productId: UuidSchema.nullable(),
  offerId: UuidSchema.nullable(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(1),
  reasonCode: z.string().nullable(),
});
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;
