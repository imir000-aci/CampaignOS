import type { Campaign } from '@/types/campaign'

declare global {
  // eslint-disable-next-line no-var
  var __campaignStore: Map<string, Campaign> | undefined
}

function seedStore(store: Map<string, Campaign>) {
  const now = new Date().toISOString()
  const campaigns: Campaign[] = [
    {
      id: 'camp-001',
      campaign_name: 'Summer Grilling 2026',
      status: 'ACTIVE',
      objective: 'ACQUISITION',
      brief_text: 'Drive incremental basket size for Summer Grilling. Budget $5M, channels EMAIL and PAID_SOCIAL, ROAS target 3.5×.',
      budget_total_cents: 500_000_00,
      budget_media_cents: 350_000_00,
      start_date: '2026-07-01',
      end_date: '2026-09-30',
      kpi_targets: [{ metric: 'roas', target: 3.5 }],
      owner_user_id: 'user-manager-001',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'camp-002',
      campaign_name: 'Back-to-School Essentials',
      status: 'PLANNING',
      objective: 'RETENTION',
      brief_text: 'Re-engage lapsed customers for back-to-school season. Budget $2M, channels EMAIL and SMS.',
      budget_total_cents: 200_000_00,
      budget_media_cents: 150_000_00,
      start_date: '2026-08-01',
      end_date: '2026-09-15',
      kpi_targets: [{ metric: 'retention_rate', target: 0.35 }],
      owner_user_id: 'user-manager-001',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'camp-003',
      campaign_name: 'Holiday Loyalty Push',
      status: 'DRAFT',
      objective: 'LOYALTY',
      brief_text: 'Drive loyalty program sign-ups during holiday season. Budget $1M.',
      budget_total_cents: 100_000_00,
      budget_media_cents: 70_000_00,
      start_date: '2026-11-15',
      end_date: '2026-12-31',
      kpi_targets: [{ metric: 'new_loyalty_signups', target: 50000 }],
      owner_user_id: 'user-manager-001',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'camp-004',
      campaign_name: 'Spring Fresh Produce',
      status: 'COMPLETED',
      objective: 'ACQUISITION',
      brief_text: 'Promote fresh produce department to new customers. Budget $3M.',
      budget_total_cents: 300_000_00,
      budget_media_cents: 220_000_00,
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      kpi_targets: [{ metric: 'roas', target: 4.0 }],
      owner_user_id: 'user-manager-001',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'camp-005',
      campaign_name: 'Pharmacy Wellness Week',
      status: 'PENDING_APPROVAL',
      objective: 'ACQUISITION',
      brief_text: 'Drive pharmacy prescription fills and OTC health product sales.',
      budget_total_cents: 150_000_00,
      budget_media_cents: 100_000_00,
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      kpi_targets: [{ metric: 'rx_fills', target: 10000 }],
      owner_user_id: 'user-manager-001',
      created_at: now,
      updated_at: now,
    },
  ]
  for (const c of campaigns) store.set(c.id, c)
}

export function getCampaignStore(): Map<string, Campaign> {
  if (!globalThis.__campaignStore) {
    globalThis.__campaignStore = new Map<string, Campaign>()
    seedStore(globalThis.__campaignStore)
  }
  return globalThis.__campaignStore
}
