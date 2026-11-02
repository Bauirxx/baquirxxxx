'use client'

import { useState, useEffect, useRef } from 'react'
import { H264Decoder } from '@/lib/h264-decoder'
import { DeviceSocket, type SessionMetaMsg } from '@/lib/device-socket'
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
  ArrowLeft,
  Home,
  SquareStack,
  Power,
} from 'lucide-react'
import type { ScreenSessionDTO, DashboardView, DeviceDTO } from '@/lib/types'

interface ScreenMirrorViewProps {
  onViewChange: (v: DashboardView) => void
}

export function ScreenMirrorView({ onViewChange }: ScreenMirrorViewProps) {
  const { t, locale } = useI18n()
  const { data: devicesData, loading: devicesLoading } = useFetch<{ devices: DeviceDTO[] }>('/api/dashboard/devices', { refreshMs: 10000 })
  const { data: sessionsData, loading: sessionsLoading, refresh: refreshSessions } = useFetch<{ sessions: ScreenSessionDTO[]; activeCount: number }>('/api/dashboard/screen-sessions', { refreshMs: 5000 })

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [touchIndicator, setTouchIndicator] = useState<{ x: number; y: number; key: number } | null>(null)
  const [recentScreenshots, setRecentScreenshots] = useState<Array<{ id: string; dataUrl: string; takenAt: string }>>([])
  const [meta, setMeta] = useState<SessionMetaMsg | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mirrorBoxRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<DeviceSocket | null>(null)
  const decoderRef = useRef<H264Decoder | null>(null)
  const metaRef = useRef<SessionMetaMsg | null>(null)
  const streamingRef = useRef(false)
  const [streaming, setStreaming] = useState(false)

  // Estatísticas REAIS do stream ao vivo (sem mocks): contadas no navegador à
  // medida que os pacotes H.264 chegam e são descodificados.
  const framesRef = useRef(0)
  const bytesRef = useRef(0)
  const firstFrameAtRef = useRef<number | null>(null)
  const lastTickRef = useRef<{ t: number; frames: number; bytes: number }>({ t: 0, frames: 0, bytes: 0 })
  const [liveStats, setLiveStats] = useState<{ frames: number; fps: number; kbps: number; seconds: number }>({ frames: 0, fps: 0, kbps: 0, seconds: 0 })

  const devices = devicesData?.devices ?? []
  const activeDevices = devices.filter(d => d.status !== 'revoked')
  const sessions = sessionsData?.sessions ?? []
  const activeSession = sessions.find(s => s.status === 'active' && (!selectedDeviceId || s.deviceId === selectedDeviceId))

  useEffect(() => {
    if (!selectedDeviceId && activeDevices.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDeviceId(activeDevices[0].id)
    }
  }, [activeDevices, selectedDeviceId])

  // Espelho ao vivo — ligação + descodificador portados do totalcontrol
  // (scrcpy/WebCodecs, formato comprovado). O relé re-embrulha o vídeo do
  // telemóvel e guarda config + GOP, por isso o ecrã aparece logo.
  useEffect(() => {
    if (!selectedDeviceId) return
    streamingRef.current = false
    framesRef.current = 0
    bytesRef.current = 0
    firstFrameAtRef.current = null
    lastTickRef.current = { t: 0, frames: 0, bytes: 0 }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStreaming(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeta(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveStats({ frames: 0, fps: 0, kbps: 0, seconds: 0 })

    const canvas = canvasRef.current
    if (!canvas || !H264Decoder.isSupported()) {
      if (!H264Decoder.isSupported()) console.warn('[mirror] WebCodecs indisponível neste browser')
      return
    }

    let decoder: H264Decoder | null = null
    try {
      decoder = new H264Decoder(canvas)
      decoder.onError = (e) => console.error('[mirror]', e.message)
      decoderRef.current = decoder
    } catch (e) {
      console.error('[mirror] decoder', e)
      return
    }

    const socket = new DeviceSocket(selectedDeviceId)
    socketRef.current = socket
    socket.onMeta = (m) => { metaRef.current = m; setMeta(m) }
    socket.onVideoPacket = (p) => {
      const m = metaRef.current
      if (!m || !decoderRef.current) return
      decoderRef.current.handlePacket(p.isConfig, p.isKeyFrame, p.ptsMicros, p.payload, m.width, m.height)
      // Estatísticas reais: só contamos pacotes de imagem (não o config SPS/PPS).
      if (!p.isConfig) {
        framesRef.current++
        bytesRef.current += p.payload.byteLength
        if (firstFrameAtRef.current == null) firstFrameAtRef.current = Date.now()
      }
      if (!streamingRef.current) {
        streamingRef.current = true
        setStreaming(true)
      }
    }
    socket.onServerMessage = (msg) => {
      if (msg.t === 'closed') {
        streamingRef.current = false
        setStreaming(false)
      }
    }
    socket.onClose = () => {
      streamingRef.current = false
      setStreaming(false)
    }

    return () => {
      socket.close()
      decoderRef.current?.close()
      decoderRef.current = null
      socketRef.current = null
      metaRef.current = null
    }
  }, [selectedDeviceId])

  // Calcula FPS e bitrate REAIS a cada segundo, a partir dos pacotes recebidos.
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      const prev = lastTickRef.current
      const dt = prev.t ? (now - prev.t) / 1000 : 0
      const fps = dt > 0 ? Math.round((framesRef.current - prev.frames) / dt) : 0
      const kbps = dt > 0 ? Math.round(((bytesRef.current - prev.bytes) * 8) / dt / 1000) : 0
      lastTickRef.current = { t: now, frames: framesRef.current, bytes: bytesRef.current }
      const seconds = firstFrameAtRef.current ? Math.floor((now - firstFrameAtRef.current) / 1000) : 0
      setLiveStats({ frames: framesRef.current, fps: Math.max(0, fps), kbps: Math.max(0, kbps), seconds })
    }, 1000)
    return () => clearInterval(iv)
  }, [])

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

  // Envia um evento de toque (down/move/up) em coords de vídeo. O relé junta o
  // down+up e decide toque vs arrasto/scroll, enviando o gesto real à app.
  function sendTouch(action: 'down' | 'move' | 'up', e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const xr = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const yr = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    const m = metaRef.current
    const w = m?.width ?? 1080
    const h = m?.height ?? 2400
    socketRef.current?.touch(action, 0, xr * w, yr * h, w, h, action === 'up' ? 0 : 1)
    if (action === 'down') {
      setTouchIndicator({ x: xr * 100, y: yr * 100, key: Date.now() })
      setTimeout(() => setTouchIndicator(null), 800)
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    sendTouch('down', e)
  }
  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    sendTouch('up', e)
  }

  function nav(cmd: 'back' | 'home' | 'recents' | 'power') {
    const s = socketRef.current
    if (!s) return
    if (cmd === 'back') s.back()
    else if (cmd === 'home') s.home()
    else if (cmd === 'recents') s.recents()
    else if (cmd === 'power') s.power()
  }

  function toggleFullscreen() {
    const el = mirrorBoxRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
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
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle ${d.online ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                  />
                  {d.name} · {t(`connection.${d.connectionType}`)} · {d.online ? t('devices.ts.online') : t('devices.status.offline')}
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
            <div
              ref={mirrorBoxRef}
              className="relative bg-black max-w-[340px] mx-auto"
              style={{ aspectRatio: meta ? `${meta.width} / ${meta.height}` : '9 / 19' }}
            >
              <canvas
                ref={canvasRef}
                width={270}
                height={570}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: 'none' }}
                className="w-full h-full block cursor-pointer object-contain"
              />
              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/5">
                  <div className="text-center px-4">
                    <MonitorPlay className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">{t('screen.empty.body')}</p>
                    <p className="text-xs text-muted-foreground/70 leading-relaxed">
                      No telemóvel: abre a app → <b>Ligar</b> → permite a captura de ecrã.
                    </p>
                    {!activeSession && (
                      <Button size="sm" onClick={startSession} className="gap-1.5 mt-3">
                        <Play className="h-3.5 w-3.5" />
                        {t('screen.start')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
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

            {/* Barra de controlo: navegação do sistema + ecrã inteiro (como no totalcontrol) */}
            <div className="flex items-center justify-center gap-2 py-3 border-t border-border/40 mt-0">
              <Button size="sm" variant="outline" onClick={() => nav('back')} title={t('control.back')} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => nav('home')} title={t('control.home')} className="gap-1.5">
                <Home className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => nav('recents')} title={t('control.recents')} className="gap-1.5">
                <SquareStack className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => nav('power')} title={t('control.power')} className="gap-1.5">
                <Power className="h-4 w-4" />
              </Button>
              <div className="w-px h-5 bg-border/60 mx-1" />
              <Button size="sm" variant="outline" onClick={toggleFullscreen} title={t('screen.fullscreen')} className="gap-1.5">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Side panel — session info + actions + screenshots */}
        <div className="space-y-4">
          {(streaming || activeSession) && (
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif-display text-sm flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${streaming ? 'bg-red-500' : 'bg-muted-foreground/40'}`} />
                  {t('screen.session.active')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Meta icon={Activity} label={t('screen.session.fps')} value={streaming ? `${liveStats.fps}` : '—'} />
                <Meta icon={Layers} label={t('screen.session.bitrate')} value={streaming ? (liveStats.kbps >= 1000 ? `${(liveStats.kbps / 1000).toFixed(1)} Mbps` : `${liveStats.kbps} kbps`) : '—'} />
                <Meta icon={MonitorPlay} label={t('screen.session.codec')} value={(meta?.codec ?? 'H264').toUpperCase()} />
                <Meta icon={Activity} label={t('screen.session.frames')} value={liveStats.frames.toLocaleString()} />
                <Meta icon={Clock} label={t('screen.session.duration')} value={formatDuration(liveStats.seconds)} />
                <Meta icon={MonitorPlay} label={t('screen.session.resolution')} value={meta ? `${meta.width}×${meta.height}` : '—'} />
                <div className="flex gap-2 pt-3">
                  <Button size="sm" variant="outline" onClick={takeScreenshot} disabled={!streaming} className="gap-1.5 flex-1">
                    <Camera className="h-3 w-3" />
                    {t('screen.screenshot')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={toggleFullscreen} className="gap-1.5">
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                  {activeSession && (
                    <Button size="sm" variant="destructive" onClick={stopSession} className="gap-1.5">
                      <Square className="h-3 w-3" />
                    </Button>
                  )}
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

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
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
