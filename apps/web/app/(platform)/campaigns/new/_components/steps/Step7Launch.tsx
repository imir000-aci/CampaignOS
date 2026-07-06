'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useWizardStore } from '@/store/wizard-store'
import { useCreateCampaign } from '@/hooks/useCampaigns'
import { useTriggerPipeline } from '@/hooks/useAgentRuns'

export function Step7Launch() {
  const router = useRouter()
  const { data, prevStep, reset } = useWizardStore()
  const createCampaign = useCreateCampaign()
  const triggerPipeline = useTriggerPipeline()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'creating' | 'triggering' | 'done'>('idle')

  async function onLaunch() {
    setError(null)
    try {
      setStatus('creating')
      const campaign = await createCampaign.mutateAsync({
        campaign_name: data.campaign_name,
        brief_text: data.brief_text,
        objective: data.objective,
        budget_total_cents: data.budget_total_cents,
        budget_media_cents: data.budget_media_cents,
        start_date: data.start_date,
        end_date: data.end_date,
        kpi_targets: data.kpi_targets,
      })

      setStatus('triggering')
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

      setStatus('done')
      reset()
      router.push(`/campaigns/${campaign.id}/monitor?run_id=${run.run_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch failed')
      setStatus('idle')
    }
  }

  const isLaunching = status !== 'idle' && status !== 'done'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Launch Campaign</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ready to start the AI agent pipeline for <strong>{data.campaign_name}</strong>.
        </p>
      </div>

      {isLaunching && (
        <div className="flex flex-col items-center gap-3 py-8">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-muted-foreground">
            {status === 'creating' ? 'Creating campaign...' : 'Starting AI pipeline...'}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!isLaunching && (
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={prevStep} disabled={isLaunching}>
            Back
          </Button>
          <Button onClick={onLaunch} disabled={isLaunching}>
            Launch AI Pipeline
          </Button>
        </div>
      )}
    </div>
  )
}
