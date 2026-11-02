'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import {
  FolderTree,
  MapPin,
  Phone,
  MessageSquare,
  Clock,
  Globe2,
  AlertTriangle,
  Siren,
  Package,
  MonitorPlay,
  Camera,
} from 'lucide-react'

interface DeviceStorage {
  deviceId: string
  deviceName: string
  childName: string | null
  status: string
  storagePath: string
  dataCount: {
    locations: number
    calls: number
    sms: number
    appUsage: number
    browser: number
    alerts: number
    sos: number
    installedApps: number
    screenSessions: number
    screenshots: number
  }
  totalEvents: number
}

export function DeviceStorageView() {
  const { t } = useI18n()
  const { data, loading } = useFetch<{ devices: DeviceStorage[] }>('/api/dashboard/device-storage', {
    refreshMs: 30000,
  })

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    )
  }

  const devices = data?.devices ?? []

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="Nenhum dispositivo com dados"
        body="Regista um dispositivo e ativa a app Companion para começar a recolher dados."
      />
    )
  }

  return (
    <div className="space-y-4">
      {devices.map(d => (
        <Card key={d.deviceId} className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                {d.deviceName}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{d.childName ?? '—'}</Badge>
                <Badge variant="secondary" className="text-[10px]">{d.status}</Badge>
                <span className="text-xs text-muted-foreground font-mono">{d.totalEvents} eventos</span>
              </div>
            </CardTitle>
            <div className="text-[10px] font-mono text-muted-foreground">{d.storagePath}</div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              <DataCell icon={MapPin} label="GPS" count={d.dataCount.locations} />
              <DataCell icon={Phone} label="Calls" count={d.dataCount.calls} />
              <DataCell icon={MessageSquare} label="SMS" count={d.dataCount.sms} />
              <DataCell icon={Clock} label="Apps" count={d.dataCount.appUsage} />
              <DataCell icon={Globe2} label="Web" count={d.dataCount.browser} />
              <DataCell icon={AlertTriangle} label="Alertas" count={d.dataCount.alerts} />
              <DataCell icon={Siren} label="SOS" count={d.dataCount.sos} />
              <DataCell icon={Package} label="Inst." count={d.dataCount.installedApps} />
              <DataCell icon={MonitorPlay} label="Sessões" count={d.dataCount.screenSessions} />
              <DataCell icon={Camera} label="Shots" count={d.dataCount.screenshots} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DataCell({ icon: Icon, label, count }: { icon: any; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-md border border-border/40 hover:bg-muted/30">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="text-xs font-mono text-foreground">{count}</div>
      <div className="text-[9px] text-muted-foreground uppercase">{label}</div>
    </div>
  )
}
