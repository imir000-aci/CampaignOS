'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PipelineMonitor } from '@/components/pipeline/PipelineMonitor'

interface Props {
  params: Promise<{ id: string }>
}

export default function CampaignMonitorPage({ params }: Props) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const runId = searchParams.get('run_id')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/campaigns/${id}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pipeline Monitor</h1>
          <p className="text-muted-foreground text-sm">Real-time agent execution view</p>
        </div>
      </div>

      {runId ? (
        <PipelineMonitor runId={runId} />
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No run selected. Start a pipeline from the campaign detail page.</p>
        </div>
      )}
    </div>
  )
}
