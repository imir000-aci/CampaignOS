import { NextRequest, NextResponse } from 'next/server'
import { getCampaignStore } from '../../store'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = getCampaignStore()
  const campaign = store.get(id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = { ...campaign, status: 'PENDING_APPROVAL' as const, updated_at: new Date().toISOString() }
  store.set(id, updated)
  return NextResponse.json(updated)
}
