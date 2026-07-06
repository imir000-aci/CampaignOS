'use client'

import Link from 'next/link'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import type { Campaign } from '@/types/campaign'

interface Props {
  campaigns: Campaign[]
}

function formatBudget(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function CampaignTable({ campaigns }: Props) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No campaigns found.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaign</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objective</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Budget</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dates</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/campaigns/${c.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {c.campaign_name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <CampaignStatusBadge status={c.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground capitalize">
                {c.objective.toLowerCase().replace('_', ' ')}
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {formatBudget(c.budget_total_cents)}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {c.start_date} – {c.end_date}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
