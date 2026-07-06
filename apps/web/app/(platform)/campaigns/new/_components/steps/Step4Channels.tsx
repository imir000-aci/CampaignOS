'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWizardStore } from '@/store/wizard-store'

const AVAILABLE_CHANNELS = [
  { id: 'EMAIL', label: 'Email' },
  { id: 'PAID_SOCIAL', label: 'Paid Social' },
  { id: 'PAID_SEARCH', label: 'Paid Search' },
  { id: 'SMS', label: 'SMS' },
  { id: 'PUSH', label: 'Push Notification' },
  { id: 'IN_APP', label: 'In-App' },
  { id: 'DISPLAY', label: 'Display' },
  { id: 'PROGRAMMATIC', label: 'Programmatic' },
]

export function Step4Channels() {
  const { data, updateData, nextStep, prevStep } = useWizardStore()
  const [selected, setSelected] = useState<string[]>(data.channels ?? [])
  const [error, setError] = useState<string | null>(null)

  function toggle(channelId: string) {
    setSelected((prev) =>
      prev.includes(channelId) ? prev.filter((c) => c !== channelId) : [...prev, channelId],
    )
    setError(null)
  }

  function onSubmit() {
    if (selected.length === 0) {
      setError('Select at least one channel')
      return
    }
    updateData({ channels: selected })
    nextStep()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Channels</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select the marketing channels for this campaign.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AVAILABLE_CHANNELS.map((ch) => {
          const isSelected = selected.includes(ch.id)
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => toggle(ch.id)}
              className={`rounded-lg border p-3 text-left text-sm font-medium transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50 hover:bg-accent'
              }`}
            >
              {ch.label}
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const ch = AVAILABLE_CHANNELS.find((c) => c.id === id)
            return <Badge key={id} variant="secondary">{ch?.label ?? id}</Badge>
          })}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
        <Button type="button" onClick={onSubmit}>Next: KPIs</Button>
      </div>
    </div>
  )
}
