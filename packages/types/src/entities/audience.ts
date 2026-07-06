import { z } from "zod";
import { BaseEntitySchema, UuidSchema, CustomerIdSchema } from "./shared";

export const AudienceTypeSchema = z.enum([
  "RULE_BASED",
  "AI_GENERATED",
  "LOOKALIKE",
  "UPLOAD",
  "COMPOSITE",
]);
export type AudienceType = z.infer<typeof AudienceTypeSchema>;

export const AudienceStatusSchema = z.enum([
  "DRAFT",
  "COMPUTING",
  "READY",
  "STALE",
  "ARCHIVED",
]);
export type AudienceStatus = z.infer<typeof AudienceStatusSchema>;

// Rule DSL for rule-based audiences
export const RuleOperatorSchema = z.enum([
  "EQ", "NEQ", "GT", "GTE", "LT", "LTE",
  "IN", "NOT_IN", "CONTAINS", "NOT_CONTAINS",
  "BETWEEN", "IS_NULL", "IS_NOT_NULL",
]);
export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

export const RuleConditionSchema = z.object({
  field: z.string(),
  operator: RuleOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())]).optional(),
});
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

export type RuleGroup = {
  combinator: "AND" | "OR";
  not?: boolean;
  conditions: Array<RuleCondition | RuleGroup>;
};
export const RuleGroupSchema: z.ZodType<RuleGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(["AND", "OR"]),
    not: z.boolean().optional(),
    conditions: z.array(z.union([RuleConditionSchema, RuleGroupSchema])).min(1),
  })
);

export const AudienceSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  audienceType: AudienceTypeSchema,
  status: AudienceStatusSchema,
  estimatedSize: z.number().int().nonnegative().nullable(),
  ruleDefinition: RuleGroupSchema.nullable(),
  seedAudienceId: UuidSchema.nullable(),
  campaignId: UuidSchema.nullable(),
  ownerUserId: UuidSchema,
  privacyRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
});
export type Audience = z.infer<typeof AudienceSchema>;

export const CreateAudienceSchema = AudienceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  status: true,
  estimatedSize: true,
  privacyRisk: true,
});
export type CreateAudienceInput = z.infer<typeof CreateAudienceSchema>;

export const LoyaltyTierSchema = z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
export type LoyaltyTier = z.infer<typeof LoyaltyTierSchema>;

export const AgeBandSchema = z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]);
export type AgeBand = z.infer<typeof AgeBandSchema>;

export const CustomerAttributesSchema = z.object({
  customerId: CustomerIdSchema,
  loyaltyTier: LoyaltyTierSchema.nullable(),
  lifetimeValueCents: z.number().int().nonnegative(),
  daysSinceLastPurchase: z.number().int().nonnegative().nullable(),
  preferredBannerId: UuidSchema.nullable(),
  ageBand: AgeBandSchema.nullable(),
  hasChildren: z.boolean().nullable(),
  zipCode: z.string().nullable(),
  digitalEnrolled: z.boolean(),
  homeStoreId: UuidSchema.nullable(),
  totalTransactions: z.number().int().nonnegative(),
  avgBasketSizeCents: z.number().int().nonnegative(),
});
export type CustomerAttributes = z.infer<typeof CustomerAttributesSchema>;

export const AudienceMemberSchema = z.object({
  id: UuidSchema,
  audienceId: UuidSchema,
  customerId: CustomerIdSchema,
  score: z.number().min(0).max(1).nullable(),
  includedAt: z.string().datetime({ offset: true }),
  excludedAt: z.string().datetime({ offset: true }).nullable(),
  source: z.enum(["RULE_MATCH", "LOOKALIKE", "UPLOAD", "AI"]),
});
export type AudienceMember = z.infer<typeof AudienceMemberSchema>;

export const AudiencePreviewSchema = z.object({
  audienceId: UuidSchema,
  sampleSize: z.number().int(),
  estimatedTotalSize: z.number().int(),
  demographicBreakdown: z.object({
    loyaltyTierDistribution: z.record(LoyaltyTierSchema, z.number()),
    ageBandDistribution: z.record(AgeBandSchema, z.number()),
    hasChildrenPct: z.number(),
    digitalEnrolledPct: z.number(),
    avgLtvCents: z.number().int(),
  }),
});
export type AudiencePreview = z.infer<typeof AudiencePreviewSchema>;

export const AudienceOverlapSchema = z.object({
  audienceId: UuidSchema,
  otherAudienceId: UuidSchema,
  overlapPct: z.number().min(0).max(100),
  overlapCount: z.number().int().nonnegative(),
});
export type AudienceOverlap = z.infer<typeof AudienceOverlapSchema>;
