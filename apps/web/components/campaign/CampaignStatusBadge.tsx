import { Badge } from '@/components/ui/badge'
import type { CampaignStatus } from '@/types/campaign'

const STATUS_CONFIG: Record<CampaignStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PLANNING: { label: 'Planning', variant: 'info' },
  PENDING_APPROVAL: { label: 'Pending Approval', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  ACTIVE: { label: 'Active', variant: 'success' },
  PAUSED: { label: 'Paused', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'secondary' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  ARCHIVED: { label: 'Archived', variant: 'outline' },
}

interface Props {
  status: CampaignStatus
}

export function CampaignStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
