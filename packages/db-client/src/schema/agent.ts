import { pgTable, varchar, integer, real, text, jsonb, uuid, pgEnum, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baseColumns } from "../columns";

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "AWAITING_HUMAN",
]);

export const agentRuns = pgTable("agent_runs", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  status: agentRunStatusEnum("status").notNull().default("PENDING"),
  inputSnapshot: jsonb("input_snapshot"),
  outputSnapshot: jsonb("output_snapshot"),
  schemaValid: boolean("schema_valid"),
  overallScore: real("overall_score"),
  dimensionScores: jsonb("dimension_scores"),
  iterationCount: integer("iteration_count").notNull().default(0),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  estimatedCostUsd: real("estimated_cost_usd"),
  latencyMs: integer("latency_ms"),
  modelUsed: varchar("model_used", { length: 100 }),
  errorMessage: text("error_message"),
  temporalWorkflowId: varchar("temporal_workflow_id", { length: 500 }),
  temporalActivityId: varchar("temporal_activity_id", { length: 500 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const agentCritiqueRecords = pgTable("agent_critique_records", {
  ...baseColumns,
  runId: uuid("run_id").notNull().references(() => agentRuns.id),
  campaignId: uuid("campaign_id").notNull(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  iteration: integer("iteration").notNull(),
  dimensionScores: jsonb("dimension_scores").notNull(),
  overallScore: real("overall_score").notNull(),
  critiqueText: text("critique_text"),
  actionTaken: varchar("action_taken", { length: 50 }).notNull(),
  costUsd: real("cost_usd"),
});

export const crossValidationRecords = pgTable("cross_validation_records", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  triggeringAgent: varchar("triggering_agent", { length: 100 }).notNull(),
  consistent: boolean("consistent").notNull(),
  violations: jsonb("violations"),
  rerouteCount: integer("reroute_count").notNull().default(0),
  resolution: text("resolution"),
});

export const humanGateRecords = pgTable("human_gate_records", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  agentName: varchar("agent_name", { length: 100 }),
  gateType: varchar("gate_type", { length: 100 }).notNull(),
  reviewerId: uuid("reviewer_id"),
  decision: varchar("decision", { length: 50 }),
  comments: text("comments"),
  revisionRequirements: jsonb("revision_requirements").$type<string[]>(),
  reviewDurationSeconds: integer("review_duration_seconds"),
  temporalSignalId: varchar("temporal_signal_id", { length: 255 }),
});

export const evalGoldenExamples = pgTable("eval_golden_examples", {
  ...baseColumns,
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  difficulty: varchar("difficulty", { length: 50 }).notNull().default("MEDIUM"),
  input: jsonb("input").notNull(),
  expectedOutputCriteria: jsonb("expected_output_criteria").notNull(),
  referenceOutput: jsonb("reference_output"),
  tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by"),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
});

export const evalRuns = pgTable("eval_runs", {
  ...baseColumns,
  triggeredBy: varchar("triggered_by", { length: 100 }).notNull(),
  commitSha: varchar("commit_sha", { length: 40 }),
  status: varchar("status", { length: 50 }).notNull().default("RUNNING"),
  perAgentScores: jsonb("per_agent_scores"),
  regressionVsBaseline: jsonb("regression_vs_baseline"),
  costVsBaseline: jsonb("cost_vs_baseline"),
  overallResult: varchar("overall_result", { length: 50 }),
  baselineRunId: uuid("baseline_run_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const campaignLessons = pgTable("campaign_lessons", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull().unique(),
  winningPatterns: jsonb("winning_patterns").$type<string[]>(),
  failurePatterns: jsonb("failure_patterns").$type<string[]>(),
  agentPerformanceNotes: jsonb("agent_performance_notes"),
  outcomeScore: real("outcome_score"),
});

export const agentPredictionAccuracy = pgTable("agent_prediction_accuracy", {
  ...baseColumns,
  campaignId: uuid("campaign_id").notNull(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  predictionType: varchar("prediction_type", { length: 100 }).notNull(),
  predictedValue: real("predicted_value"),
  actualValue: real("actual_value"),
  absoluteError: real("absolute_error"),
  relativeErrorPct: real("relative_error_pct"),
  within20Pct: boolean("within_20_pct"),
});

export const promptImprovementTasks = pgTable("prompt_improvement_tasks", {
  ...baseColumns,
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("OPEN"),
  patternDescription: text("pattern_description").notNull(),
  affectedCampaignIds: jsonb("affected_campaign_ids").$type<string[]>(),
  evidenceSummary: text("evidence_summary"),
  suggestedPromptChange: text("suggested_prompt_change"),
  assigneeId: uuid("assignee_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const agentSchema = {
  agentRuns,
  agentCritiqueRecords,
  crossValidationRecords,
  humanGateRecords,
  evalGoldenExamples,
  evalRuns,
  campaignLessons,
  agentPredictionAccuracy,
  promptImprovementTasks,
};
