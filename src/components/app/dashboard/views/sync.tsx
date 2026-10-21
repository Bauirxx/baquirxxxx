'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { toast } from 'sonner'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Target,
  Clock,
  Gauge,
  Send,
  Check,
} from 'lucide-react'
import type { DeviceDTO, SyncConfigDTO, SyncMode, SyncEventDTO } from '@/lib/types'

const MODES: SyncMode[] = ['rigid', 'adaptive', 'independent']

export function SyncView() {
  const { t, locale } = useI18n()
  const { data: devicesData } = useFetch<{ devices: DeviceDTO[] }>('/api/dashboard/devices')
  const { data: configData, refresh: refreshConfig } = useFetch<SyncConfigDTO>('/api/dashboard/sync')
  const { data: metricsData, refresh: refreshMetrics } = useFetch<{ recentEvents: SyncEventDTO[] } | null>('/api/dashboard/metrics', { refreshMs: 10000 })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<SyncMode>('adaptive')
  const [toleranceMs, setToleranceMs] = useState(80)
  const [marginMs, setMarginMs] = useState(50)
  const [elementBased, setElementBased] = useState(true)
  const [broadcasting, setBroadcasting] = useState(false)
  const [saving, setSaving] = useState(false)

  const devices = devicesData?.devices ?? []
  const activeDevices = devices.filter(d => d.status !== 'revoked')
  const recentEvents = metricsData?.recentEvents ?? []

  useEffect(() => {
    if (configData) {
      setMode(configData.mode)
      setToleranceMs(configData.toleranceMs)
      setMarginMs(configData.marginMs)
      setElementBased(configData.elementBased)
    }
  }, [configData])

  function toggleDevice(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(activeDevices.map(d => d.id)))
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  async function saveConfig() {
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, toleranceMs, marginMs, elementBased }),
      })
      if (res.ok) {
        toast.success(t('toast.saved'))
        refreshConfig()
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setSaving(false)
    }
  }

  async function broadcastTest() {
    if (selectedIds.size === 0) {
      toast.error(t('toast.error'))
      return
    }
    setBroadcasting(true)
    try {
      const res = await fetch('/api/dashboard/sync/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: Array.from(selectedIds),
          commandType: 'touch',
          payload: { x: 50, y: 50 },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(t('sync.broadcast.sent', { count: selectedIds.size }))
        refreshMetrics()
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setBroadcasting(false)
    }
  }

  if (activeDevices.length === 0) {
    return (
      <EmptyState
        icon={RefreshCw}
        title={t('sync.empty.title')}
        body={t('sync.empty.body')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Device list */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                {t('sync.devices')}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs">{t('sync.select.all')}</Button>
                <Button size="sm" variant="ghost" onClick={deselectAll} className="text-xs">{t('sync.deselect.all')}</Button>
              </div>
            </CardTitle>
            <CardDescription>{t('sync.selected', { count: selectedIds.size })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeDevices.map(d => (
              <label
                key={d.id}
                className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  selectedIds.has(d.id) ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(d.id)}
                  onChange={() => toggleDevice(d.id)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.model} · {t(`connection.${d.connectionType}`)}</div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {d.screenW}×{d.screenH}
                </Badge>
              </label>
            ))}
            <Button
              size="sm"
              onClick={broadcastTest}
              disabled={selectedIds.size === 0 || broadcasting}
              className="gap-1.5 w-full mt-2"
            >
              {broadcasting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {t('sync.broadcast.test')}
            </Button>
          </CardContent>
        </Card>

        {/* Config panel */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              {t('sync.mode')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {MODES.map(m => (
                <label
                  key={m}
                  className={`block p-3 rounded-md border cursor-pointer transition-colors ${
                    mode === m ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t(`sync.mode.${m}`)}</span>
                    <input
                      type="radio"
                      name="syncMode"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="accent-[var(--primary)]"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t(`sync.mode.${m}.desc`)}</div>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {t('sync.tolerance')}
                </Label>
                <span className="text-xs font-mono">{toleranceMs}ms</span>
              </div>
              <Slider
                value={[toleranceMs]}
                onValueChange={(v) => setToleranceMs(v[0])}
                min={0}
                max={500}
                step={10}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t('sync.margin')}
                </Label>
                <span className="text-xs font-mono">{marginMs}ms</span>
              </div>
              <Slider
                value={[marginMs]}
                onValueChange={(v) => setMarginMs(v[0])}
                min={0}
                max={500}
                step={10}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <Label className="text-xs">{t('sync.element.based')}</Label>
                  <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[240px]">
                    {t('sync.element.based.hint')}
                  </div>
                </div>
                <Switch checked={elementBased} onCheckedChange={setElementBased} />
              </label>
            </div>

            <Button size="sm" onClick={saveConfig} disabled={saving} className="gap-1.5 w-full">
              {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {t('sync.save.config')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent sync events */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif-display text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('sync.last.events')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <EmptyState icon={RefreshCw} title={t('sync.empty.title')} body={t('sync.empty.body')} />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
              {recentEvents.map(e => (
                <div key={e.id} className="border border-border/40 rounded-md p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono">{e.commandType}</div>
                    <div className="text-muted-foreground font-mono">
                      {new Date(e.timestamp).toLocaleString(locale)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className="text-[10px]">{t(`sync.mode.${e.mode}`)}</Badge>
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      {e.successCount}
                    </span>
                    {e.failCount > 0 && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        {e.failCount}
                      </span>
                    )}
                    <span className="text-muted-foreground">Δ {e.avgDeviation.toFixed(0)}ms</span>
                    <span className="text-muted-foreground">max {e.maxDeviation.toFixed(0)}ms</span>
                  </div>
                  {e.targets && e.targets.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-1.5">
                      {e.targets.map((t: any, i: number) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                            t.success
                              ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          {t.success ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                          {t.deviceName} · {t.deviationMs}ms
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
