import { NextRequest, NextResponse } from 'next/server'
import { getCampaignStore } from '../store'
import type { Campaign } from '@/types/campaign'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = getCampaignStore()
  const campaign = store.get(id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(campaign)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = getCampaignStore()
  const campaign = store.get(id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch = (await request.json()) as Partial<Campaign>
  const updated: Campaign = { ...campaign, ...patch, id, updated_at: new Date().toISOString() }
  store.set(id, updated)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = getCampaignStore()
  if (!store.has(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  store.delete(id)
  return NextResponse.json({ deleted: true })
}
