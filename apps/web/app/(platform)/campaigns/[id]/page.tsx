'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CampaignStatusBadge } from '@/components/campaign/CampaignStatusBadge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { useCampaign } from '@/hooks/useCampaigns'
import { useAgentRuns, useTriggerPipeline } from '@/hooks/useAgentRuns'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

function formatBudget(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US')}`
}

export default function CampaignDetailPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const { data: campaign, isLoading } = useCampaign(id)
  const { data: runsData } = useAgentRuns({ campaign_id: id })
  const triggerPipeline = useTriggerPipeline()

  async function handleTrigger() {
    if (!campaign) return
    const run = await triggerPipeline.mutateAsync({
      campaign_id: campaign.id,
      brief: {
        campaign_name: campaign.campaign_name,
        brief_text: campaign.brief_text,
        objective: campaign.objective,
        budget_total_cents: campaign.budget_total_cents,
        budget_media_cents: campaign.budget_media_cents,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        kpi_targets: campaign.kpi_targets,
      },
      stub_mode: true,
    })
    router.push(`/campaigns/${id}/monitor?run_id=${run.run_id}`)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!campaign) {
    return <div className="p-6 text-muted-foreground">Campaign not found.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{campaign.campaign_name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
        </div>
        <PermissionGuard permission="agents:trigger">
          <Button onClick={handleTrigger} disabled={triggerPipeline.isPending}>
            <Play className="h-4 w-4" />
            {triggerPipeline.isPending ? 'Starting...' : 'Run Pipeline'}
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Objective</CardTitle></CardHeader>
          <CardContent><p className="font-medium capitalize">{campaign.objective.toLowerCase().replace('_', ' ')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Budget</CardTitle></CardHeader>
          <CardContent><p className="font-bold text-xl">{formatBudget(campaign.budget_total_cents)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Flight Dates</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{campaign.start_date} – {campaign.end_date}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Campaign Brief</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{campaign.brief_text}</p>
        </CardContent>
      </Card>

      {campaign.kpi_targets.length > 0 && (
        <Card>
          <CardHeader><CardTitle>KPI Targets</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {campaign.kpi_targets.map((k) => (
              <Badge key={k.metric} variant="outline">{k.metric}: {k.target}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {runsData && runsData.runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pipeline Runs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runsData.runs.map((run) => (
                <Link
                  key={run.run_id}
                  href={`/campaigns/${id}/monitor?run_id=${run.run_id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-mono">{run.run_id.slice(0, 8)}…</p>
                    <p className="text-xs text-muted-foreground">{run.current_step}</p>
                  </div>
                  <Badge variant={run.status === 'COMPLETED' ? 'success' : run.status === 'FAILED' ? 'destructive' : 'info'}>
                    {run.status}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
