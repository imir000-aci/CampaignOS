import { pgTable, varchar, integer, text, jsonb, uuid, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { baseColumns } from "../columns";

export const activationPlatformEnum = pgEnum("activation_platform", [
  "BRAZE", "SFMC", "AEM", "INTERNAL_PUSH", "INTERNAL_SMS",
]);

export const activationStatusEnum = pgEnum("activation_status", [
  "QUEUED", "DISPATCHING", "ACTIVE", "PAUSED", "COMPLETED", "FAILED", "CANCELLED",
]);

export const activationRequests = pgTable("activation_requests", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  platform: activationPlatformEnum("platform").notNull(),
  status: activationStatusEnum("status").notNull().default("QUEUED"),
  audienceId: uuid("audience_id").notNull(),
  experienceId: uuid("experience_id"),
  targetingConfigId: uuid("targeting_config_id"),
  offerId: uuid("offer_id"),
  platformJobId: varchar("platform_job_id", { length: 500 }),
  platformCampaignId: varchar("platform_campaign_id", { length: 500 }),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  retryCount: integer("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
  requestPayload: jsonb("request_payload"),
  platformResponse: jsonb("platform_response"),
});

export const activationEvents = pgTable("activation_events", {
  ...baseColumns,
  activationRequestId: uuid("activation_request_id").notNull().references(() => activationRequests.id),
  campaignId: uuid("campaign_id").notNull(),
  platform: activationPlatformEnum("platform").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  customerId: varchar("customer_id", { length: 255 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata"),
});

export const activationJobHistory = pgTable("activation_job_history", {
  ...baseColumns,
  activationRequestId: uuid("activation_request_id").notNull().references(() => activationRequests.id),
  previousStatus: activationStatusEnum("previous_status"),
  newStatus: activationStatusEnum("new_status").notNull(),
  note: text("note"),
  actorType: varchar("actor_type", { length: 50 }),
});

export const activationSchema = {
  activationRequests,
  activationEvents,
  activationJobHistory,
};
