'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWizardStore } from '@/store/wizard-store'

interface KpiEntry {
  metric: string
  target: string
}

const KPI_SUGGESTIONS = ['roas', 'ctr', 'conversion_rate', 'reach', 'impressions', 'revenue']

export function Step5KPIs() {
  const { data, updateData, nextStep, prevStep } = useWizardStore()
  const [kpis, setKpis] = useState<KpiEntry[]>(
    data.kpi_targets?.map((k) => ({ metric: k.metric, target: String(k.target) })) ?? [
      { metric: 'roas', target: '3.5' },
    ],
  )
  const [error, setError] = useState<string | null>(null)

  function addKpi() {
    setKpis((prev) => [...prev, { metric: '', target: '' }])
  }

  function removeKpi(i: number) {
    setKpis((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateKpi(i: number, field: keyof KpiEntry, value: string) {
    setKpis((prev) => prev.map((k, idx) => (idx === i ? { ...k, [field]: value } : k)))
    setError(null)
  }

  function onSubmit() {
    const valid = kpis.filter((k) => k.metric.trim() && k.target.trim())
    if (valid.length === 0) {
      setError('Add at least one KPI target')
      return
    }
    const parsed = valid.map((k) => ({ metric: k.metric.trim(), target: parseFloat(k.target) }))
    if (parsed.some((k) => isNaN(k.target))) {
      setError('All KPI targets must be numbers')
      return
    }
    updateData({ kpi_targets: parsed })
    nextStep()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">KPI Targets</h2>
        <p className="text-sm text-muted-foreground mt-1">Define measurable targets for this campaign.</p>
      </div>

      <div className="space-y-3">
        {kpis.map((kpi, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              {i === 0 && <Label>Metric</Label>}
              <Input
                list="kpi-suggestions"
                placeholder="roas"
                value={kpi.metric}
                onChange={(e) => updateKpi(i, 'metric', e.target.value)}
              />
            </div>
            <div className="w-32 space-y-1">
              {i === 0 && <Label>Target</Label>}
              <Input
                type="number"
                step="any"
                placeholder="3.5"
                value={kpi.target}
                onChange={(e) => updateKpi(i, 'target', e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeKpi(i)}
              className="mb-0"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      <datalist id="kpi-suggestions">
        {KPI_SUGGESTIONS.map((k) => <option key={k} value={k} />)}
      </datalist>

      <Button type="button" variant="outline" size="sm" onClick={addKpi}>
        <Plus className="h-4 w-4" /> Add KPI
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
        <Button type="button" onClick={onSubmit}>Next: Review</Button>
      </div>
    </div>
  )
}
