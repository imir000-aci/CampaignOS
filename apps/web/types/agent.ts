export type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'AWAITING_GATE1'
  | 'AWAITING_GATE2'
  | 'COMPLETED'
  | 'REJECTED'
  | 'VALIDATION_FAILED'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'FAILED'

export interface AgentRun {
  run_id: string
  campaign_id: string
  thread_id: string
  status: RunStatus
  agent_outputs: Record<string, boolean>
  current_step: string
  gate1_approved: boolean | null
  gate2_approved: boolean | null
  error: string | null
  started_at: number
  completed_at: number | null
  estimated_cost_usd: number
  tokens_used: number
  agent_costs: Record<string, { tokens_used: number; estimated_cost_usd: number }>
}

export interface AgentDefinition {
  name: string
  model: string
  step: number | string
  parallel_group: string | null
}

export interface PipelineEvent {
  type: string
  data: Record<string, unknown>
  ts: number
}

export interface ApprovalRequest {
  gate_type: string
  campaign_id: string
  payload: Record<string, unknown>
  requested_at: number
}
