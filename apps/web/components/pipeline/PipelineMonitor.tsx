'use client'

import { useEffect } from 'react'
import { usePipelineStream } from '@/hooks/usePipelineStream'
import { useAgentRun, useAgentDefinitions } from '@/hooks/useAgentRuns'
import { AgentStepCard } from './AgentStepCard'
import { ApprovalGateModal } from './ApprovalGateModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { useCancelRun } from '@/hooks/useAgentRuns'
import { apiFetch } from '@/lib/api-client'
import type { ApprovalRequest } from '@/types/agent'

interface Props {
  runId: string
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  PENDING: 'secondary',
  RUNNING: 'info',
  AWAITING_GATE1: 'warning',
  AWAITING_GATE2: 'warning',
  COMPLETED: 'success',
  REJECTED: 'destructive',
  VALIDATION_FAILED: 'destructive',
  ESCALATED: 'warning',
  CANCELLED: 'secondary',
  FAILED: 'destructive',
}

export function PipelineMonitor({ runId }: Props) {
  const { events, isDone, reconnect } = usePipelineStream(runId)
  const { data: run, refetch: refetchRun } = useAgentRun(runId)
  const { data: agentsData } = useAgentDefinitions()
  const cancelRun = useCancelRun()

  // Poll run after SSE events to pick up status changes
  useEffect(() => {
    if (events.length > 0) void refetchRun()
  }, [events.length, refetchRun])

  // Fetch approval request when awaiting gate
  const isAwaiting = run?.status === 'AWAITING_GATE1' || run?.status === 'AWAITING_GATE2'

  function handleGateDecision() {
    reconnect()
    void refetchRun()
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const agents = agentsData?.agents ?? []
  const completedAgents = new Set(Object.keys(run.agent_outputs).filter((k) => run.agent_outputs[k]))
  const currentStepAgent = run.current_step.toLowerCase().replace('_complete', '')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Pipeline Run</h2>
            <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>{run.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{runId}</p>
        </div>
        <div className="flex items-center gap-2">
          {run.status === 'RUNNING' && <LoadingSpinner size="sm" />}
          <PermissionGuard permission="agents:cancel">
            {!['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED'].includes(run.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelRun.mutate({ runId, reason: 'Cancelled by user' })}
                disabled={cancelRun.isPending}
              >
                Cancel
              </Button>
            )}
          </PermissionGuard>
        </div>
      </div>

      {/* Agent steps grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const agentCost = run.agent_costs[agent.name]
          return (
            <AgentStepCard
              key={agent.name}
              agent={agent}
              completed={completedAgents.has(agent.name)}
              running={run.status === 'RUNNING' && currentStepAgent.includes(agent.name)}
              failed={run.status === 'FAILED'}
              tokensUsed={agentCost?.tokens_used}
              costUsd={agentCost?.estimated_cost_usd}
            />
          )
        })}
      </div>

      {/* Cost summary */}
      {run.tokens_used > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total tokens used</span>
            <span className="font-mono">{run.tokens_used.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-muted-foreground">Estimated cost</span>
            <span className="font-mono">${run.estimated_cost_usd.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Event log */}
      {events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Event Log</h3>
          <div className="rounded-lg border bg-muted/20 p-3 max-h-48 overflow-auto space-y-1">
            {events.map((evt, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">
                  {new Date(evt.ts * 1000).toLocaleTimeString()}
                </span>
                <span className="font-medium">{evt.type}</span>
                {evt.data && Object.keys(evt.data).length > 0 && (
                  <span className="text-muted-foreground truncate">
                    {JSON.stringify(evt.data)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval gate modal */}
      <PermissionGuard permission="agents:approve">
        <ApprovalGateModal
          runId={runId}
          status={run.status}
          approvalRequest={null}
          onDecision={handleGateDecision}
        />
      </PermissionGuard>
    </div>
  )
}
