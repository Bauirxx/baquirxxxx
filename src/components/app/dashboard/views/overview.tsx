'use client'

import { useI18n } from '@/lib/i18n/context'
import { StatCard } from '../components/stat-card'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Smartphone, Activity, AlertTriangle, Siren, Phone, MessageSquare, Clock, MapPin, MonitorPlay, RefreshCw, Package } from 'lucide-react'
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { OverviewStatsDTO, DashboardView } from '@/lib/types'

interface OverviewProps {
  user: { id: string }
  onViewChange: (v: DashboardView) => void
  onAlertsChange: Dispatch<SetStateAction<number>>
  onSosChange: Dispatch<SetStateAction<number>>
}

function formatMs(ms: number) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return '< 1m'
}

export function OverviewView({ user, onViewChange, onAlertsChange, onSosChange }: OverviewProps) {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<OverviewStatsDTO>('/api/dashboard/overview', {
    refreshMs: 15000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    if (rtEvents.length > 0) refresh()
  }, [rtEvents, refresh])

  // Atualiza badges de alertas ativos (sidebar)
  useEffect(() => {
    if (data) {
      onAlertsChange(data.unresolvedAlerts)
      onSosChange(data.unresolvedSos)
    }
  }, [data, onAlertsChange, onSosChange])

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    )
  }

  if (!data) {
    return <Skeleton className="h-64 w-full" />
  }

  const hasData =
    data.totalDevices > 0 && data.activeDevices > 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('overview.stat.devices')}
          value={data.totalDevices}
          icon={Smartphone}
          tone="default"
          hint={`${data.activeDevices} ${t('overview.stat.active').toLowerCase()}, ${data.pendingDevices} ${t('devices.status.pending').toLowerCase()}`}
        />
        <StatCard
          label={t('overview.stat.alerts')}
          value={data.unresolvedAlerts}
          icon={AlertTriangle}
          tone={data.unresolvedAlerts > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={t('overview.stat.sos')}
          value={data.unresolvedSos}
          icon={Siren}
          tone={data.unresolvedSos > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label={t('overview.stat.screen')}
          value={formatMs(data.screenTimeTodayMs)}
          icon={Clock}
          tone="primary"
        />
      </div>

      {/* ScreenPorter — stats extras */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label={t('sidebar.screen-mirror')}
          value={data.activeScreenSessions}
          icon={MonitorPlay}
          tone="primary"
        />
        <StatCard
          label={t('metrics.stat.commands')}
          value={data.syncEvents24h}
          icon={RefreshCw}
        />
        <StatCard
          label={t('apps.installed')}
          value={data.installedApps}
          icon={Package}
        />
        <StatCard label={t('overview.stat.calls')} value={data.callsToday} icon={Phone} />
        <StatCard label={t('overview.stat.sms')} value={data.smsToday} icon={MessageSquare} />
        <StatCard
          label={t('overview.stat.active')}
          value={data.activeDevices}
          icon={Activity}
          tone="primary"
        />
      </div>

      {/* Última localização compacta */}
      {data.lastLocation && (
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-lg flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {t('overview.stat.lastLoc')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm text-foreground">
              {data.lastLocation.latitude.toFixed(5)}, {data.lastLocation.longitude.toFixed(5)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(data.lastLocation.timestamp).toLocaleString(locale)}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData && (
        <EmptyState
          icon={Smartphone}
          title={t('overview.empty.title')}
          body={t('overview.empty.body')}
          cta={{ label: t('overview.empty.cta'), onClick: () => onViewChange('devices') }}
        />
      )}
    </div>
  )
}
