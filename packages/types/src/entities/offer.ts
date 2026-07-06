import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";

export const OfferTypeSchema = z.enum([
  "PERCENT_OFF",
  "DOLLAR_OFF",
  "BOGO",
  "FREE_ITEM",
  "POINTS_MULTIPLIER",
  "CATEGORY_DISCOUNT",
]);
export type OfferType = z.infer<typeof OfferTypeSchema>;

export const OfferStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
  "ARCHIVED",
]);
export type OfferStatus = z.infer<typeof OfferStatusSchema>;

export const OfferSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  offerType: OfferTypeSchema,
  status: OfferStatusSchema,
  discountValue: z.number().positive(),
  minPurchaseCents: z.number().int().nonnegative(),
  maxRedemptionsPerCustomer: z.number().int().positive().nullable(),
  budgetTotalCents: z.number().int().positive().nullable(),
  budgetRemainingCents: z.number().int().nonnegative().nullable(),
  validFromAt: z.string().datetime({ offset: true }),
  validUntilAt: z.string().datetime({ offset: true }).nullable(),
  campaignId: UuidSchema.nullable(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const CreateOfferSchema = OfferSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  budgetRemainingCents: true,
  status: true,
});
export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;

export const OfferEligibilityRuleSchema = BaseEntitySchema.extend({
  offerId: UuidSchema,
  ruleType: z.enum([
    "LOYALTY_TIER",
    "PRODUCT_ID",
    "CATEGORY_ID",
    "BANNER_ID",
    "DIVISION_ID",
    "STORE_ID",
    "MIN_LTV_CENTS",
    "MAX_REDEMPTIONS_TOTAL",
    "DIGITAL_ENROLLED",
  ]),
  ruleValue: z.string(),
  includeOrExclude: z.enum(["INCLUDE", "EXCLUDE"]),
});
export type OfferEligibilityRule = z.infer<typeof OfferEligibilityRuleSchema>;

export const OfferRedemptionSchema = BaseEntitySchema.extend({
  offerId: UuidSchema,
  customerId: UuidSchema,
  revenueEventId: UuidSchema,
  discountAppliedCents: z.number().int().positive(),
  redeemedAt: z.string().datetime({ offset: true }),
});
export type OfferRedemption = z.infer<typeof OfferRedemptionSchema>;

export const OfferEligibilityCheckSchema = z.object({
  customerId: UuidSchema,
  offerIds: z.array(UuidSchema).min(1).max(100),
});
export type OfferEligibilityCheckInput = z.infer<typeof OfferEligibilityCheckSchema>;

export const OfferEligibilityResultSchema = z.object({
  customerId: UuidSchema,
  results: z.array(z.object({
    offerId: UuidSchema,
    eligible: z.boolean(),
    reason: z.string().optional(),
  })),
});
export type OfferEligibilityResult = z.infer<typeof OfferEligibilityResultSchema>;

export const OfferRedemptionStatsSchema = z.object({
  offerId: UuidSchema,
  totalRedemptions: z.number().int(),
  uniqueCustomers: z.number().int(),
  totalDiscountCents: z.number().int(),
  budgetUtilizationPct: z.number().nullable(),
  redemptionsByDay: z.array(z.object({
    date: z.string(),
    count: z.number().int(),
    discountCents: z.number().int(),
  })),
});
export type OfferRedemptionStats = z.infer<typeof OfferRedemptionStatsSchema>;
