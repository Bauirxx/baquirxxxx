'use client'

import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  MapPin,
  Phone,
  MessageSquare,
  Clock,
  Globe2,
  AlertTriangle,
  Siren,
  Smartphone,
  Settings,
  ShieldCheck,
  LogOut,
  MonitorPlay,
  Gamepad2,
  RefreshCw,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import type { DashboardView } from '@/lib/types'

interface SidebarProps {
  currentView: DashboardView
  onViewChange: (view: DashboardView) => void
  onLogout: () => void
  userName: string
  activeAlerts: number
}

interface NavItem {
  key: DashboardView
  icon: LucideIcon
  badgeKey?: 'alerts' | 'sos'
}

const NAV_GROUPS: { groupKey: string; items: NavItem[] }[] = [
  {
    groupKey: 'sidebar.group.monitoring',
    items: [
      { key: 'overview', icon: LayoutDashboard },
      { key: 'location', icon: MapPin },
      { key: 'calls', icon: Phone },
      { key: 'sms', icon: MessageSquare },
      { key: 'apps', icon: Clock },
      { key: 'browser', icon: Globe2 },
      { key: 'alerts', icon: AlertTriangle, badgeKey: 'alerts' },
      { key: 'sos', icon: Siren, badgeKey: 'sos' },
    ],
  },
  {
    groupKey: 'sidebar.group.control',
    items: [
      { key: 'screen-mirror', icon: MonitorPlay },
      { key: 'remote-control', icon: Gamepad2 },
      { key: 'sync', icon: RefreshCw },
      { key: 'metrics', icon: BarChart3 },
    ],
  },
  {
    groupKey: 'sidebar.group.account',
    items: [
      { key: 'devices', icon: Smartphone },
      { key: 'settings', icon: Settings },
    ],
  },
]

export function Sidebar({ currentView, onViewChange, onLogout, userName, activeAlerts }: SidebarProps) {
  const { t } = useI18n()

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border/60 bg-sidebar text-sidebar-foreground h-screen sticky top-0">
      <div className="h-16 flex items-center gap-2 px-4 border-b border-border/40">
        <div className="h-7 w-7 rounded-md bg-sidebar-primary flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="font-serif-display text-lg">{t('brand.name')}</span>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-4">
        {NAV_GROUPS.map(group => (
          <div key={group.groupKey} className="space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 px-3 pb-1">
              {t(group.groupKey)}
            </div>
            {group.items.map(item => {
              const Icon = item.icon
              const isActive = currentView === item.key
              const badge = item.badgeKey === 'alerts' || item.badgeKey === 'sos' ? activeAlerts : 0
              return (
                <button
                  key={item.key}
                  onClick={() => onViewChange(item.key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{t(`sidebar.${item.key}`)}</span>
                  {badge > 0 && (
                    <span className="ml-auto inline-flex h-4 min-w-4 px-1 items-center justify-center text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border/40 p-3 space-y-2">
        <div className="text-xs text-muted-foreground px-1">
          {t('dashboard.welcome', { name: userName })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          {t('dashboard.logout')}
        </Button>
      </div>
    </aside>
  )
}

// Bottom navigation (mobile) — alterna para drawer em telas pequenas
export function MobileBottomNav({
  currentView,
  onViewChange,
  activeAlerts,
}: {
  currentView: DashboardView
  onViewChange: (view: DashboardView) => void
  activeAlerts: number
}) {
  const { t } = useI18n()
  const items: NavItem[] = NAV_GROUPS[0].items.concat(NAV_GROUPS[1].items)
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur grid grid-cols-5 h-16">
      {items.slice(0, 5).map(item => {
        const Icon = item.icon
        const isActive = currentView === item.key
        const badge = item.badgeKey ? activeAlerts : 0
        return (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[10px] relative',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate max-w-full">{t(`sidebar.${item.key}`)}</span>
            {badge > 0 && (
              <span className="absolute top-1.5 right-1/4 inline-flex h-4 min-w-4 px-1 items-center justify-center text-[9px] font-bold rounded-full bg-destructive text-destructive-foreground">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
