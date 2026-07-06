import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";
import { ChannelSchema } from "./campaign";

export const ActivationPlatformSchema = z.enum([
  "BRAZE",
  "SFMC",
  "AEM",
  "INTERNAL_PUSH",
  "INTERNAL_SMS",
]);
export type ActivationPlatform = z.infer<typeof ActivationPlatformSchema>;

export const ActivationRequestStatusSchema = z.enum([
  "QUEUED",
  "DISPATCHING",
  "DISPATCHED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "RETRYING",
]);
export type ActivationRequestStatus = z.infer<typeof ActivationRequestStatusSchema>;

export const ActivationRequestSchema = BaseEntitySchema.extend({
  campaignId: UuidSchema,
  channel: ChannelSchema,
  platform: ActivationPlatformSchema,
  status: ActivationRequestStatusSchema,
  audienceId: UuidSchema,
  experienceVariantId: UuidSchema.nullable(),
  targetingConfigId: UuidSchema,
  platformJobId: z.string().nullable(),
  dispatchedAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  failureReason: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  deliveryStats: z.object({
    targeted: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    clicked: z.number().int().nonnegative(),
    bounced: z.number().int().nonnegative(),
    unsubscribed: z.number().int().nonnegative(),
  }).nullable(),
});
export type ActivationRequest = z.infer<typeof ActivationRequestSchema>;

export const ActivationEventSchema = z.object({
  id: UuidSchema,
  activationRequestId: UuidSchema,
  campaignId: UuidSchema,
  customerId: UuidSchema.nullable(),
  platform: ActivationPlatformSchema,
  eventType: z.enum([
    "SENT",
    "DELIVERED",
    "OPENED",
    "CLICKED",
    "BOUNCED",
    "UNSUBSCRIBED",
    "CONVERTED",
  ]),
  occurredAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.unknown()).optional(),
});
export type ActivationEvent = z.infer<typeof ActivationEventSchema>;
