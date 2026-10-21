'use client'

import { useState, useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { toast } from 'sonner'
import {
  MonitorPlay,
  Camera,
  Play,
  Square,
  Maximize2,
  Activity,
  Clock,
  Layers,
} from 'lucide-react'
import type { ScreenSessionDTO, DashboardView, DeviceDTO } from '@/lib/types'

interface ScreenMirrorViewProps {
  onViewChange: (v: DashboardView) => void
}

export function ScreenMirrorView({ onViewChange }: ScreenMirrorViewProps) {
  const { t, locale } = useI18n()
  const { data: devicesData, loading: devicesLoading } = useFetch<{ devices: DeviceDTO[] }>('/api/dashboard/devices')
  const { data: sessionsData, loading: sessionsLoading, refresh: refreshSessions } = useFetch<{ sessions: ScreenSessionDTO[]; activeCount: number }>('/api/dashboard/screen-sessions', { refreshMs: 5000 })

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [touchIndicator, setTouchIndicator] = useState<{ x: number; y: number; key: number } | null>(null)
  const [recentScreenshots, setRecentScreenshots] = useState<Array<{ id: string; dataUrl: string; takenAt: string }>>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const devices = devicesData?.devices ?? []
  const activeDevices = devices.filter(d => d.status !== 'revoked')
  const sessions = sessionsData?.sessions ?? []
  const activeSession = sessions.find(s => s.status === 'active' && (!selectedDeviceId || s.deviceId === selectedDeviceId))

  useEffect(() => {
    if (!selectedDeviceId && activeDevices.length > 0) {
      setSelectedDeviceId(activeDevices[0].id)
    }
  }, [activeDevices, selectedDeviceId])

  async function startSession() {
    if (!selectedDeviceId) {
      toast.error(t('toast.error'))
      return
    }
    const res = await fetch('/api/dashboard/screen-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: selectedDeviceId }),
    })
    if (res.ok) {
      toast.success(t('screen.session.active'))
      refreshSessions()
      return
    }
    toast.error(t('toast.error'))
  }

  async function stopSession() {
    if (!activeSession) return
    const res = await fetch('/api/dashboard/screen-sessions/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: activeSession.id }),
    })
    if (res.ok) {
      toast.success(t('screen.session.stopped'))
      refreshSessions()
    } else {
      toast.error(t('toast.error'))
    }
  }

  async function takeScreenshot() {
    if (!selectedDeviceId || !canvasRef.current) return
    // Captura o conteúdo REAL do canvas do navegador
    const dataUrl = canvasRef.current.toDataURL('image/png')
    const res = await fetch('/api/dashboard/screen-sessions/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: selectedDeviceId,
        sessionId: activeSession?.id,
        dataUrl,
        width: canvasRef.current.width,
        height: canvasRef.current.height,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      toast.success(t('screen.screenshot'))
      setRecentScreenshots(prev => [{ ...data.screenshot, dataUrl }, ...prev].slice(0, 6))
    } else {
      toast.error(t('toast.error'))
    }
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!activeSession || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const key = Date.now()
    setTouchIndicator({ x, y, key })
    setTimeout(() => setTouchIndicator(null), 1500)
    // Envia comando de toque real ao aparelho
    fetch('/api/dashboard/remote-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: selectedDeviceId,
        command: 'touch',
        payload: { x: Math.round(x), y: Math.round(y) },
      }),
    })
  }

  if (devicesLoading && !devicesData) {
    return <Skeleton className="h-64 w-full" />
  }

  if (activeDevices.length === 0) {
    return (
      <EmptyState
        icon={MonitorPlay}
        title={t('screen.empty.title')}
        body={t('screen.empty.body')}
        cta={{ label: t('overview.empty.cta'), onClick: () => onViewChange('devices') }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Device selector */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('screen.device.select')}:</div>
            <div className="flex flex-wrap gap-2">
              {activeDevices.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDeviceId(d.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    selectedDeviceId === d.id
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:bg-muted/50'
                  }`}
                >
                  {d.name} · {t(`connection.${d.connectionType}`)}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mirror canvas — empty until real H.264 stream arrives */}
      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <Card className="border-border/60 shadow-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-primary" />
                {activeSession ? t('screen.session.active') : t('screen.empty.title')}
              </span>
              {activeSession && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-red-600 dark:text-red-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-soft-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  {t('screen.rec')}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activeSession ? (
              <div className="relative bg-foreground/5 aspect-[9/19] max-w-[340px] mx-auto">
                {/* Canvas fica aguardando o stream H.264 do agente Android.
                    Em produção, o WebCodecs VideoDecoder desenharia os frames recebidos aqui. */}
                <canvas
                  ref={canvasRef}
                  width={270}
                  height={570}
                  onClick={handleCanvasClick}
                  className="w-full h-full block cursor-pointer"
                />
                {touchIndicator && (
                  <div className="absolute top-2 right-2 text-[10px] font-mono text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                    {t('screen.touch.indicator')}: {Math.round(touchIndicator.x)}%,{Math.round(touchIndicator.y)}%
                  </div>
                )}
                {touchIndicator && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${touchIndicator.x}%`,
                      top: `${touchIndicator.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ width: 24, height: 24 }} />
                      <div className="relative rounded-full bg-primary border-2 border-background" style={{ width: 18, height: 18 }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-[9/19] max-w-[340px] mx-auto flex items-center justify-center bg-foreground/5">
                <div className="text-center">
                  <MonitorPlay className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">{t('screen.empty.body')}</p>
                  <Button size="sm" onClick={startSession} className="gap-1.5">
                    <Play className="h-3.5 w-3.5" />
                    {t('screen.start')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Side panel — session info + actions + screenshots */}
        <div className="space-y-4">
          {activeSession && (
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif-display text-sm">{t('screen.session.active')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Meta icon={Activity} label={t('screen.session.fps')} value={`${activeSession.fps}`} />
                <Meta icon={Layers} label={t('screen.session.bitrate')} value={`${(activeSession.bitrate / 1_000_000).toFixed(1)} Mbps`} />
                <Meta icon={MonitorPlay} label={t('screen.session.codec')} value={activeSession.codec} />
                <Meta icon={Activity} label={t('screen.session.frames')} value={activeSession.framesReceived.toLocaleString()} />
                <Meta icon={Clock} label={t('screen.session.duration')} value={`${Math.max(1, Math.floor((Date.now() - new Date(activeSession.startedAt).getTime()) / 60000))} min`} />
                <Meta icon={MonitorPlay} label={t('screen.session.resolution')} value={`${activeSession.width ?? '—'}×${activeSession.height ?? '—'}`} />
                <div className="flex gap-2 pt-3">
                  <Button size="sm" variant="outline" onClick={takeScreenshot} className="gap-1.5 flex-1">
                    <Camera className="h-3 w-3" />
                    {t('screen.screenshot')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toast.success(t('screen.fullscreen'))} className="gap-1.5">
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={stopSession} className="gap-1.5">
                    <Square className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border/40 mt-2">
                  {t('screen.tip.touch')}
                </div>
              </CardContent>
            </Card>
          )}

          {recentScreenshots.length > 0 && (
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif-display text-sm flex items-center gap-2">
                  <Camera className="h-3.5 w-3.5" />
                  {t('screen.recent.screenshots')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {recentScreenshots.map(s => (
                    <div key={s.id} className="aspect-[9/16] rounded overflow-hidden border border-border/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.dataUrl} alt={s.takenAt} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Meta({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}
