'use client'

import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/permissions'
import type { ReactNode } from 'react'

type Permission = Parameters<typeof hasPermission>[1]

interface Props {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}

export function PermissionGuard({ permission, children, fallback = null }: Props) {
  const user = useAuthStore((s) => s.user)
  if (!user || !hasPermission(user.role, permission)) return <>{fallback}</>
  return <>{children}</>
}
