'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWizardStore } from '@/store/wizard-store'

function formatBudget(cents?: number): string {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString('en-US')}`
}

export function Step6Review() {
  const { data, nextStep, prevStep } = useWizardStore()

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Campaign Name', value: data.campaign_name ?? '—' },
    { label: 'Objective', value: data.objective ?? '—' },
    { label: 'Total Budget', value: formatBudget(data.budget_total_cents) },
    { label: 'Media Budget', value: formatBudget(data.budget_media_cents) },
    { label: 'Start Date', value: data.start_date ?? '—' },
    { label: 'End Date', value: data.end_date ?? '—' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Review Campaign</h2>
        <p className="text-sm text-muted-foreground mt-1">Confirm everything looks correct before launching.</p>
      </div>

      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      {data.channels && data.channels.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Channels</p>
          <div className="flex flex-wrap gap-2">
            {data.channels.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
        </div>
      )}

      {data.kpi_targets && data.kpi_targets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">KPI Targets</p>
          <div className="flex flex-wrap gap-2">
            {data.kpi_targets.map((k) => (
              <Badge key={k.metric} variant="outline">{k.metric}: {k.target}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-primary mb-1">What happens next?</p>
        <p className="text-muted-foreground">
          Clicking Launch will create this campaign and start the 9-agent AI pipeline.
          You'll be redirected to the Pipeline Monitor where you can approve Gate 1 (Strategy Review)
          and Gate 2 (Final Preview) as the agents complete their work.
        </p>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
        <Button type="button" onClick={nextStep}>Launch Pipeline</Button>
      </div>
    </div>
  )
}
