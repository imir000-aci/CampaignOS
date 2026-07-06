import { NextRequest, NextResponse } from 'next/server'
import { getCampaignStore } from './store'
import type { Campaign, CampaignStatus } from '@/types/campaign'

export async function GET(request: NextRequest) {
  const store = getCampaignStore()
  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') as CampaignStatus | null
  const q = searchParams.get('q')?.toLowerCase()

  let campaigns = Array.from(store.values())
  if (status) campaigns = campaigns.filter((c) => c.status === status)
  if (q) {
    campaigns = campaigns.filter(
      (c) =>
        c.campaign_name.toLowerCase().includes(q) ||
        c.brief_text.toLowerCase().includes(q),
    )
  }
  campaigns.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return NextResponse.json({
    data: campaigns,
    pagination: { cursor: null, has_more: false, total_count: campaigns.length },
  })
}

export async function POST(request: NextRequest) {
  const store = getCampaignStore()
  const body = (await request.json()) as Partial<Campaign>

  const now = new Date().toISOString()
  const id = `camp-${Date.now()}`
  const campaign: Campaign = {
    id,
    campaign_name: body.campaign_name ?? 'Untitled Campaign',
    status: 'DRAFT',
    objective: body.objective ?? 'ACQUISITION',
    brief_text: body.brief_text ?? '',
    budget_total_cents: body.budget_total_cents ?? 0,
    budget_media_cents: body.budget_media_cents ?? 0,
    start_date: body.start_date ?? '',
    end_date: body.end_date ?? '',
    kpi_targets: body.kpi_targets ?? [],
    owner_user_id: 'user-manager-001',
    created_at: now,
    updated_at: now,
  }

  store.set(id, campaign)
  return NextResponse.json(campaign, { status: 201 })
}
