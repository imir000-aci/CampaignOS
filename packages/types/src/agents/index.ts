import { z } from "zod";
import { UuidSchema, TimestampSchema } from "../entities/shared";

// ─── Agent Names ─────────────────────────────────────────────────────────────────

export const AgentNameSchema = z.enum([
  "strategy",
  "audience",
  "creative",
  "targeting",
  "experience",
  "experiment",
  "measurement",
  "validation",
  "preview",
  "supervisor",
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const AGENT_NAMES = AgentNameSchema.options;

// ─── Agent Run Status ─────────────────────────────────────────────────────────────

export const AgentRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "AWAITING_HUMAN_REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "LOW_CONFIDENCE",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

// ─── Intra-Agent Validation ────────────────────────────────────────────────────────

export const CritiqueActionSchema = z.enum(["EMIT", "REVISE", "ESCALATE"]);
export type CritiqueAction = z.infer<typeof CritiqueActionSchema>;

export const CritiqueResultSchema = z.object({
  scores: z.record(z.string(), z.number().min(1).max(5)),
  weakDims: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  overallScore: z.number().min(0).max(5),
  critiqueText: z.string(),
  action: CritiqueActionSchema,
  iteration: z.number().int().nonnegative(),
});
export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;

// ─── Agent Config ─────────────────────────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  agentName: AgentNameSchema,
  model: z.string().default("claude-sonnet-5"),
  maxTokenBudget: z.number().int().positive(),
  critiqueModel: z.string().default("claude-haiku-4-5"),
  critiqueThreshold: z.number().min(0).max(5),
  hardMinimum: z.number().min(0).max(5),
  maxIterations: z.number().int().positive(),
  stubMode: z.boolean().default(false),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ─── Agent Input / Output ─────────────────────────────────────────────────────────

export const AgentInputSchema = z.object({
  campaignId: UuidSchema,
  runId: UuidSchema,
  upstreamOutputs: z.record(AgentNameSchema, z.record(z.unknown())).optional(),
  config: AgentConfigSchema.partial().optional(),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;

export const AgentOutputSchema = z.object({
  runId: UuidSchema,
  campaignId: UuidSchema,
  agentName: AgentNameSchema,
  status: AgentRunStatusSchema,
  output: z.record(z.unknown()),
  schemaValid: z.boolean(),
  critiqueHistory: z.array(CritiqueResultSchema),
  finalScore: z.number().nullable(),
  tokensUsed: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  completedAt: TimestampSchema,
  flags: z.array(z.string()),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ─── Agent Run Record ─────────────────────────────────────────────────────────────

export const AgentRunSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  agentName: AgentNameSchema,
  status: AgentRunStatusSchema,
  workflowId: z.string().nullable(),
  temporalRunId: z.string().nullable(),
  input: z.record(z.unknown()).nullable(),
  output: z.record(z.unknown()).nullable(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  iterationCount: z.number().int().nonnegative(),
  overallScore: z.number().nullable(),
  errorMessage: z.string().nullable(),
  stubMode: z.boolean(),
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

// ─── Human Gate ─────────────────────────────────────────────────────────────────────

export const HumanGateDecisionSchema = z.enum([
  "APPROVED",
  "REJECTED",
  "APPROVED_WITH_COMMENTS",
]);
export type HumanGateDecision = z.infer<typeof HumanGateDecisionSchema>;

export const HumanGateRequestSchema = z.object({
  runId: UuidSchema,
  campaignId: UuidSchema,
  agentName: AgentNameSchema,
  gateType: z.enum(["STRATEGY_REVIEW", "PREVIEW_REVIEW", "COMPLIANCE_REVIEW", "LOW_CONFIDENCE"]),
  agentOutputSummary: z.string(),
  pendingSince: TimestampSchema,
  slaDeadlineAt: TimestampSchema.nullable(),
});
export type HumanGateRequest = z.infer<typeof HumanGateRequestSchema>;

export const HumanGateResponseSchema = z.object({
  runId: UuidSchema,
  decision: HumanGateDecisionSchema,
  comments: z.string().optional(),
  revisionRequirements: z.array(z.string()).optional(),
  reviewerUserId: UuidSchema,
});
export type HumanGateResponse = z.infer<typeof HumanGateResponseSchema>;

// ─── Cross-Agent Validation ──────────────────────────────────────────────────────

export const ViolationSeveritySchema = z.enum(["BLOCKER", "WARNING", "INFO"]);
export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>;

export const ViolationSchema = z.object({
  severity: ViolationSeveritySchema,
  violatedConstraint: z.string(),
  affectedAgents: z.array(AgentNameSchema),
  suggestedFix: z.string(),
});
export type Violation = z.infer<typeof ViolationSchema>;

export const ConsistencyReportSchema = z.object({
  consistent: z.boolean(),
  violations: z.array(ViolationSchema),
});
export type ConsistencyReport = z.infer<typeof ConsistencyReportSchema>;

// ─── Supervisor Coherence ──────────────────────────────────────────────────────────

export const CoherenceReportSchema = z.object({
  overallCoherenceScore: z.number().min(0).max(1),
  dimensionScores: z.object({
    narrative: z.number().min(0).max(1),
    audienceFit: z.number().min(0).max(1),
    budget: z.number().min(0).max(1),
    experiment: z.number().min(0).max(1),
    measurement: z.number().min(0).max(1),
    timeline: z.number().min(0).max(1),
  }),
  criticalGaps: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type CoherenceReport = z.infer<typeof CoherenceReportSchema>;
