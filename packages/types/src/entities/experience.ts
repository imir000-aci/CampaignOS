import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";
import { ChannelSchema } from "./campaign";

export const ExperienceTypeSchema = z.enum([
  "EMAIL",
  "PUSH",
  "SMS",
  "LANDING_PAGE",
  "IN_APP",
  "PAID_SOCIAL_AD",
]);
export type ExperienceType = z.infer<typeof ExperienceTypeSchema>;

export const ExperienceStatusSchema = z.enum([
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "ACTIVE",
  "ARCHIVED",
]);
export type ExperienceStatus = z.infer<typeof ExperienceStatusSchema>;

export const ExperienceSlotTypeSchema = z.enum([
  "IMAGE",
  "COPY",
  "OFFER_REF",
  "PRODUCT_REF",
  "HTML_BLOCK",
  "DYNAMIC_PERSONALIZATION",
]);
export type ExperienceSlotType = z.infer<typeof ExperienceSlotTypeSchema>;

export const ExperienceSlotSchema = BaseEntitySchema.extend({
  experienceId: UuidSchema,
  variantId: UuidSchema,
  slotKey: z.string(),
  slotType: ExperienceSlotTypeSchema,
  contentValue: z.string().nullable(),
  creativeAssetId: UuidSchema.nullable(),
  offerId: UuidSchema.nullable(),
  personalizationRule: z.record(z.unknown()).nullable(),
});
export type ExperienceSlot = z.infer<typeof ExperienceSlotSchema>;

export const ExperienceVariantSchema = BaseEntitySchema.extend({
  experienceId: UuidSchema,
  variantKey: z.string(),
  isControl: z.boolean(),
  weight: z.number().int().min(1).max(100),
  slots: z.array(ExperienceSlotSchema).optional(),
});
export type ExperienceVariant = z.infer<typeof ExperienceVariantSchema>;

export const ExperienceSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  experienceType: ExperienceTypeSchema,
  channel: ChannelSchema,
  status: ExperienceStatusSchema,
  name: z.string().min(1).max(255),
  templateId: UuidSchema.nullable(),
  variants: z.array(ExperienceVariantSchema).optional(),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ExperienceTemplateSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  channel: ChannelSchema,
  baseHtml: z.string().nullable(),
  slotDefinitions: z.array(z.object({
    key: z.string(),
    type: ExperienceSlotTypeSchema,
    required: z.boolean(),
    description: z.string(),
  })),
});
export type ExperienceTemplate = z.infer<typeof ExperienceTemplateSchema>;
