'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Megaphone,
  Users,
  FlaskConical,
  Bot,
  BarChart3,
  ShieldCheck,
  CheckSquare,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { PermissionGuard } from '@/components/shared/PermissionGuard'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare },
  { href: '/monitoring/agents', label: 'Agent Runs', icon: Bot },
  { href: '/monitoring/costs', label: 'Costs', icon: BarChart3, adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <span className="font-bold text-primary text-lg">CampaignOS</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
          if (item.adminOnly) {
            return (
              <PermissionGuard key={item.href} permission="costs:read">
                {link}
              </PermissionGuard>
            )
          }
          return link
        })}
      </nav>
    </aside>
  )
}
