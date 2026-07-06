import { z } from "zod";

// RFC 7807 Problem Details
export const ApiErrorSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
  errors: z.array(z.object({
    field: z.string().optional(),
    code: z.string(),
    message: z.string(),
  })).optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE: "UNPROCESSABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  // Domain-specific
  CAMPAIGN_INVALID_TRANSITION: "CAMPAIGN_INVALID_TRANSITION",
  AUDIENCE_COMPUTING: "AUDIENCE_COMPUTING",
  AGENT_ALREADY_RUNNING: "AGENT_ALREADY_RUNNING",
  APPROVAL_GATE_PENDING: "APPROVAL_GATE_PENDING",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  OFFER_INELIGIBLE: "OFFER_INELIGIBLE",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
