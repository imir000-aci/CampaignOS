import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";

export const BundleStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type BundleStatus = z.infer<typeof BundleStatusSchema>;

export const BundleSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  status: BundleStatusSchema,
  themeTag: z.string().nullable(),
  campaignId: UuidSchema.nullable(),
  validFromAt: z.string().datetime({ offset: true }),
  validUntilAt: z.string().datetime({ offset: true }).nullable(),
});
export type Bundle = z.infer<typeof BundleSchema>;

export const BundleProductSchema = BaseEntitySchema.extend({
  bundleId: UuidSchema,
  productId: UuidSchema,
  quantity: z.number().int().positive().default(1),
  required: z.boolean().default(true),
  offerId: UuidSchema.nullable(),
  displayOrder: z.number().int().nonnegative(),
});
export type BundleProduct = z.infer<typeof BundleProductSchema>;
