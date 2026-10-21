'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { toast } from 'sonner'
import {
  Clock,
  Smartphone,
  Upload,
  Play,
  Loader2,
  Package,
  Settings2,
} from 'lucide-react'
import type { AppUsageDTO, InstalledAppDTO, DeviceDTO } from '@/lib/types'

function formatMs(ms: number) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function AppsView() {
  const { t } = useI18n()
  const { data: usageData, loading: usageLoading, refresh: refreshUsage } = useFetch<{ events: AppUsageDTO[] }>('/api/dashboard/apps', {
    refreshMs: 30000,
  })
  const { data: devicesData } = useFetch<{ devices: DeviceDTO[] }>('/api/dashboard/devices')

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [installTargets, setInstallTargets] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState(false)
  const [apkName, setApkName] = useState('')

  const devices = devicesData?.devices ?? []
  const activeDevices = devices.filter(d => d.status !== 'revoked')

  useEffect(() => {
    if (!selectedDeviceId && activeDevices.length > 0) {
      setSelectedDeviceId(activeDevices[0].id)
    }
  }, [activeDevices, selectedDeviceId])

  // Fetch installed apps when device changes
  const { data: installedData, loading: installedLoading, refresh: refreshInstalled } = useFetch<{ apps: InstalledAppDTO[] }>(
    selectedDeviceId ? `/api/dashboard/installed-apps?deviceId=${selectedDeviceId}` : null,
    { deps: [selectedDeviceId] }
  )

  // Apps usage
  const apps = usageData?.events ?? []
  const totalMs = apps.reduce((sum, a) => sum + a.foregroundMs, 0)
  const maxMs = Math.max(...apps.map(a => a.foregroundMs), 1)

  // Installed apps
  const installedApps = installedData?.apps ?? []

  function toggleInstallTarget(id: string) {
    setInstallTargets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function openApp(packageName: string) {
    if (!selectedDeviceId) return
    const res = await fetch('/api/dashboard/installed-apps/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: selectedDeviceId, packageName }),
    })
    if (res.ok) {
      toast.success(`${packageName} → ${activeDevices.find(d => d.id === selectedDeviceId)?.name}`)
    } else {
      toast.error(t('toast.error'))
    }
  }

  async function installApk() {
    if (installTargets.size === 0) {
      toast.error(t('toast.error'))
      return
    }
    setInstalling(true)
    try {
      const res = await fetch('/api/dashboard/installed-apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: Array.from(installTargets),
          apkName: apkName || 'app-release.apk',
        }),
      })
      if (res.ok) {
        toast.success(t('apps.install.success', { count: installTargets.size }))
        setApkName('')
        // Refresh installed apps on each target device
        refreshInstalled()
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Screen time (existing usage data) */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif-display text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {t('overview.stat.screen')}
            </span>
            <span className="text-2xl text-primary">{formatMs(totalMs)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {usageLoading && !usageData ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : apps.length === 0 ? (
            <EmptyState icon={Smartphone} title={t('apps.empty.title')} body={t('apps.empty.body')} />
          ) : (
            apps.map(app => {
              const pct = (app.foregroundMs / maxMs) * 100
              return (
                <div key={app.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium">{app.appName}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {formatMs(app.foregroundMs)}
                      {app.dataUsageBytes != null && app.dataUsageBytes > 0 && ` · ${formatBytes(app.dataUsageBytes)}`}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 font-mono">{app.packageName}</div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Installed apps */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif-display text-lg flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {t('apps.installed')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('apps.installed.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Device selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('apps.select.device')}:</span>
            {activeDevices.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDeviceId(d.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  selectedDeviceId === d.id
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>

          {/* Installed apps list */}
          {installedLoading && !installedData ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : installedApps.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">{t('apps.empty.installed')}</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto scrollbar-thin">
              {installedApps.map(app => (
                <div
                  key={app.id}
                  className="flex items-center gap-2 p-2 rounded-md border border-border/40 hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{app.appName}</span>
                      {app.systemApp && (
                        <Badge variant="outline" className="text-[9px] gap-0.5">
                          <Settings2 className="h-2 w-2" />
                          {t('apps.col.system')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {app.packageName} · v{app.versionName ?? '—'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => openApp(app.packageName)}
                    aria-label={t('apps.action.open')}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Install APK */}
      <Card className="border-primary/40 bg-primary/5 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif-display text-lg flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            {t('apps.install.apk')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('apps.install.apk.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t('apps.upload')}</label>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".apk"
                onChange={(e) => setApkName(e.target.files?.[0]?.name ?? '')}
                className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer"
              />
              {apkName && <span className="text-xs text-muted-foreground self-center">{apkName}</span>}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('apps.install.targets')}:</label>
            <div className="flex flex-wrap gap-2">
              {activeDevices.map(d => (
                <button
                  key={d.id}
                  onClick={() => toggleInstallTarget(d.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    installTargets.has(d.id)
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            onClick={installApk}
            disabled={installTargets.size === 0 || installing}
            className="gap-1.5"
          >
            {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {t('apps.install.start')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
