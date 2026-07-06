'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampaignTable } from '@/components/campaign/CampaignTable'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { useCampaigns } from '@/hooks/useCampaigns'

export default function CampaignsPage() {
  const [q, setQ] = useState('')
  const { data, isLoading, error } = useCampaigns({ q: q || undefined })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground">
            {data ? `${data.pagination.total_count} campaigns` : ''}
          </p>
        </div>
        <PermissionGuard permission="campaigns:create">
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </PermissionGuard>
      </div>

      <Input
        placeholder="Search campaigns..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      {isLoading && (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load campaigns: {error.message}
        </div>
      )}

      {data && <CampaignTable campaigns={data.data} />}
    </div>
  )
}
