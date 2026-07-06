import { pgTable, varchar, text, integer, bigint, date, jsonb, uuid, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baseColumns } from "../columns";

export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT", "PLANNING", "PENDING_APPROVAL", "APPROVED",
  "ACTIVE", "PAUSED", "COMPLETED", "REJECTED", "CREATION_FAILED", "ARCHIVED",
]);

export const campaignObjectiveEnum = pgEnum("campaign_objective", [
  "AWARENESS", "CONSIDERATION", "CONVERSION", "RETENTION", "LOYALTY", "WINBACK",
]);

export const approvalGateTypeEnum = pgEnum("approval_gate_type", [
  "STRATEGY_REVIEW", "PREVIEW_REVIEW", "COMPLIANCE_REVIEW",
]);

export const approvalGateStatusEnum = pgEnum("approval_gate_status", [
  "PENDING", "APPROVED", "REJECTED", "ESCALATED", "EXPIRED",
]);

export const campaigns = pgTable("campaigns", {
  ...baseColumns,
  externalId: varchar("external_id", { length: 255 }),
  name: varchar("name", { length: 500 }).notNull(),
  status: campaignStatusEnum("status").notNull().default("DRAFT"),
  objective: campaignObjectiveEnum("objective").notNull(),
  briefText: text("brief_text"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budgetTotalCents: bigint("budget_total_cents", { mode: "number" }),
  budgetMediaCents: bigint("budget_media_cents", { mode: "number" }),
  budgetProductionCents: bigint("budget_production_cents", { mode: "number" }),
  channelMix: jsonb("channel_mix").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ownerUserId: uuid("owner_user_id").notNull(),
  divisionId: varchar("division_id", { length: 255 }),
  bannerId: varchar("banner_id", { length: 255 }),
  temporalWorkflowId: varchar("temporal_workflow_id", { length: 500 }),
});

export const campaignKpis = pgTable("campaign_kpis", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  metricName: varchar("metric_name", { length: 255 }).notNull(),
  targetValue: bigint("target_value", { mode: "number" }).notNull(),
  measurementWindowDays: integer("measurement_window_days").notNull().default(30),
  unit: varchar("unit", { length: 100 }),
});

export const planningSessions = pgTable("planning_sessions", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  supervisorThreadId: varchar("supervisor_thread_id", { length: 500 }),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
});

export const planningSessionMessages = pgTable("planning_session_messages", {
  ...baseColumns,
  sessionId: uuid("session_id").notNull().references(() => planningSessions.id),
  role: varchar("role", { length: 50 }).notNull(),
  content: text("content").notNull(),
  agentName: varchar("agent_name", { length: 100 }),
});

export const approvalGates = pgTable("approval_gates", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  gateType: approvalGateTypeEnum("gate_type").notNull(),
  status: approvalGateStatusEnum("status").notNull().default("PENDING"),
  approverUserId: uuid("approver_user_id"),
  rejectionReason: text("rejection_reason"),
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
  escalationLevel: integer("escalation_level").notNull().default(1),
  temporalSignalSent: timestamp("temporal_signal_sent", { withTimezone: true }),
});

export const campaignActivities = pgTable("campaign_activities", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  actorId: uuid("actor_id"),
  actorType: varchar("actor_type", { length: 50 }).notNull().default("USER"),
  action: varchar("action", { length: 255 }).notNull(),
  previousStatus: campaignStatusEnum("previous_status"),
  newStatus: campaignStatusEnum("new_status"),
  metadata: jsonb("metadata"),
});

export const campaignDrafts = pgTable("campaign_drafts", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id).unique(),
  strategyOutput: jsonb("strategy_output"),
  audienceOutput: jsonb("audience_output"),
  creativeOutput: jsonb("creative_output"),
  targetingOutput: jsonb("targeting_output"),
  experienceOutput: jsonb("experience_output"),
  experimentOutput: jsonb("experiment_output"),
  measurementOutput: jsonb("measurement_output"),
  validationOutput: jsonb("validation_output"),
  previewOutput: jsonb("preview_output"),
  coherenceReport: jsonb("coherence_report"),
  crossValidationWarnings: jsonb("cross_validation_warnings"),
});

export const strategySchema = {
  campaigns,
  campaignKpis,
  planningSessions,
  planningSessionMessages,
  approvalGates,
  campaignActivities,
  campaignDrafts,
};
