import type { UserRole } from '@/types/auth'

type Permission =
  | 'campaigns:read'
  | 'campaigns:create'
  | 'campaigns:update'
  | 'campaigns:approve'
  | 'campaigns:launch'
  | 'campaigns:cancel'
  | 'agents:read'
  | 'agents:trigger'
  | 'agents:approve'
  | 'agents:cancel'
  | 'costs:read'
  | 'monitoring:read'
  | 'admin:*'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'campaigns:read', 'campaigns:create', 'campaigns:update',
    'campaigns:approve', 'campaigns:launch', 'campaigns:cancel',
    'agents:read', 'agents:trigger', 'agents:approve', 'agents:cancel',
    'costs:read', 'monitoring:read', 'admin:*',
  ],
  CAMPAIGN_MANAGER: [
    'campaigns:read', 'campaigns:create', 'campaigns:update', 'campaigns:cancel',
    'agents:read', 'agents:trigger', 'agents:cancel',
    'monitoring:read',
  ],
  CREATIVE_APPROVER: [
    'campaigns:read', 'campaigns:approve',
    'agents:read', 'agents:approve',
  ],
  ANALYST: [
    'campaigns:read', 'agents:read', 'monitoring:read',
  ],
  VIEWER: [
    'campaigns:read',
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? []
  if (perms.includes('admin:*')) return true
  return perms.includes(permission)
}
