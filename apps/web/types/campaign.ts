export type CampaignStatus =
  | 'DRAFT'
  | 'PLANNING'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'ARCHIVED'

export interface KpiTarget {
  metric: string
  target: number
}

export interface Campaign {
  id: string
  campaign_name: string
  status: CampaignStatus
  objective: string
  brief_text: string
  budget_total_cents: number
  budget_media_cents: number
  start_date: string
  end_date: string
  kpi_targets: KpiTarget[]
  owner_user_id: string
  created_at: string
  updated_at: string
}

export interface CampaignListResponse {
  data: Campaign[]
  pagination: { cursor: string | null; has_more: boolean; total_count: number }
}
