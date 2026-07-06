export type UserRole = 'ADMIN' | 'CAMPAIGN_MANAGER' | 'CREATIVE_APPROVER' | 'ANALYST' | 'VIEWER'

export interface AuthUser {
  sub: string
  email: string
  role: UserRole
  division_ids: string[]
}

export interface AuthState {
  token: string | null
  user: AuthUser | null
}
