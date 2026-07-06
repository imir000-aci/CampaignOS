'use client'

import Link from 'next/link'
import { useAgentRuns } from '@/hooks/useAgentRuns'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export default function ApprovalsPage() {
  const { data: gate1, isLoading: l1 } = useAgentRuns({ status: 'AWAITING_GATE1' })
  const { data: gate2, isLoading: l2 } = useAgentRuns({ status: 'AWAITING_GATE2' })

  const isLoading = l1 || l2
  const runs = [...(gate1?.runs ?? []), ...(gate2?.runs ?? [])]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-muted-foreground">Pipeline runs awaiting your review</p>
      </div>

      {isLoading && (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No runs currently awaiting approval.</p>
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link
              key={run.run_id}
              href={`/campaigns/${run.campaign_id}/monitor?run_id=${run.run_id}`}
              className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div className="space-y-1">
                <p className="font-medium">{run.campaign_id}</p>
                <p className="text-xs font-mono text-muted-foreground">{run.run_id}</p>
                <p className="text-xs text-muted-foreground">{run.current_step}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="warning">{run.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(run.started_at * 1000).toLocaleTimeString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
