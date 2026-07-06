'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { AppShell } from '@/components/layout/AppShell'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const router = useRouter()

  useEffect(() => {
    // Small delay to allow zustand persist rehydration
    const t = setTimeout(() => {
      if (!token) router.replace('/login')
    }, 50)
    return () => clearTimeout(t)
  }, [token, router])

  if (!token) return null

  return <AppShell>{children}</AppShell>
}
