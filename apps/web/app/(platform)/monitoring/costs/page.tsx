'use client'

import { useAgentRuns } from '@/hooks/useAgentRuns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { PermissionGuard } from '@/components/shared/PermissionGuard'

export default function CostsPage() {
  return (
    <PermissionGuard
      permission="costs:read"
      fallback={
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          You do not have permission to view cost data.
        </div>
      }
    >
      <CostsContent />
    </PermissionGuard>
  )
}

function CostsContent() {
  const { data, isLoading } = useAgentRuns()

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const runs = data?.runs ?? []
  const completedRuns = runs.filter((r) => r.status === 'COMPLETED')
  const totalCost = runs.reduce((sum, r) => sum + r.estimated_cost_usd, 0)
  const totalTokens = runs.reduce((sum, r) => sum + r.tokens_used, 0)

  // Aggregate per-agent costs across all runs
  const agentCosts: Record<string, { tokens: number; cost: number; runs: number }> = {}
  for (const run of runs) {
    for (const [agent, cost] of Object.entries(run.agent_costs)) {
      if (!agentCosts[agent]) agentCosts[agent] = { tokens: 0, cost: 0, runs: 0 }
      agentCosts[agent]!.tokens += cost.tokens_used
      agentCosts[agent]!.cost += cost.estimated_cost_usd
      agentCosts[agent]!.runs += 1
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cost Monitoring</h1>
        <p className="text-muted-foreground">Token usage and estimated LLM costs</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{runs.length}</p>
            <p className="text-xs text-muted-foreground">{completedRuns.length} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Estimated Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${totalCost.toFixed(4)}</p>
          </CardContent>
        </Card>
      </div>

      {Object.keys(agentCosts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Per-Agent Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Agent</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Runs</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Tokens</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(agentCosts)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([agent, stats]) => (
                    <tr key={agent} className="border-b last:border-0">
                      <td className="py-2 capitalize font-medium">{agent}</td>
                      <td className="py-2 text-right text-muted-foreground">{stats.runs}</td>
                      <td className="py-2 text-right font-mono text-xs">{stats.tokens.toLocaleString()}</td>
                      <td className="py-2 text-right font-mono text-xs">${stats.cost.toFixed(4)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
