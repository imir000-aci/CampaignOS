'use client'

import Link from 'next/link'
import { useAgentRuns } from '@/hooks/useAgentRuns'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import type { RunStatus } from '@/types/agent'

const STATUS_VARIANT: Record<RunStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
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

export default function AgentRunsPage() {
  const { data, isLoading } = useAgentRuns()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Runs</h1>
        <p className="text-muted-foreground">All pipeline executions</p>
      </div>

      {isLoading && (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {data && data.runs.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No pipeline runs yet.</p>
        </div>
      )}

      {data && data.runs.length > 0 && (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Run ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaign</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Step</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cost</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.run_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/campaigns/${run.campaign_id}/monitor?run_id=${run.run_id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {run.run_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{run.campaign_id}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>{run.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{run.current_step}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {run.estimated_cost_usd > 0 ? `$${run.estimated_cost_usd.toFixed(4)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(run.started_at * 1000).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
