'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { toast } from 'sonner'
import {
  Gamepad2,
  ArrowLeft,
  Home,
  LayoutGrid,
  Power,
  Volume2,
  VolumeX,
  Keyboard,
  Send,
  Crosshair,
  Smartphone,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import type { DeviceDTO, DashboardView, RemoteCommandType } from '@/lib/types'

interface RemoteControlViewProps {
  onViewChange?: (v: DashboardView) => void
}

interface ControlEvent {
  id: string
  deviceId: string
  command: RemoteCommandType
  payload: any
  timestamp: string
  status: 'ok' | 'fail'
}

export function RemoteControlView({ onViewChange }: RemoteControlViewProps) {
  const { t, locale } = useI18n()
  const { data: devicesData, loading: devicesLoading } = useFetch<{ devices: DeviceDTO[] }>('/api/dashboard/devices')
  const { data: eventsData, refresh: refreshEvents } = useFetch<{ events: ControlEvent[] }>('/api/dashboard/remote-control', { refreshMs: 15000 })

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [keyboardText, setKeyboardText] = useState('')
  const [touchX, setTouchX] = useState(50)
  const [touchY, setTouchY] = useState(50)
  const [sending, setSending] = useState<string | null>(null)

  const devices = devicesData?.devices ?? []
  const activeDevices = devices.filter(d => d.status !== 'revoked')
  const events = eventsData?.events ?? []

  useEffect(() => {
    if (!selectedDeviceId && activeDevices.length > 0) {
      setSelectedDeviceId(activeDevices[0].id)
    }
  }, [activeDevices, selectedDeviceId])

  async function sendCommand(command: RemoteCommandType, payload?: any) {
    if (!selectedDeviceId) {
      toast.error(t('toast.error'))
      return
    }
    setSending(command)
    try {
      const res = await fetch('/api/dashboard/remote-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: selectedDeviceId, command, payload }),
      })
      if (res.ok) {
        toast.success(`${command} → ${activeDevices.find(d => d.id === selectedDeviceId)?.name}`)
        refreshEvents()
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setSending(null)
    }
  }

  function sendKeyboard() {
    if (!keyboardText.trim()) return
    sendCommand('text', { text: keyboardText })
    setKeyboardText('')
  }

  function sendTouch() {
    sendCommand('touch', { x: touchX, y: touchY })
  }

  if (devicesLoading && !devicesData) {
    return <Skeleton className="h-64 w-full" />
  }

  if (activeDevices.length === 0) {
    return (
      <EmptyState
        icon={Gamepad2}
        title={t('control.eventlog.empty')}
        body={t('screen.empty.body')}
        cta={onViewChange ? { label: t('overview.empty.cta'), onClick: () => onViewChange('devices') } : undefined}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Device selector */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('control.device.select')}:</div>
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
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        {/* D-Pad + buttons */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-sm flex items-center gap-2">
              <Gamepad2 className="h-4 w-4" />
              {t('control.dpad')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nav buttons */}
            <div className="grid grid-cols-4 gap-2">
              <NavButton icon={ArrowLeft} label={t('control.back')} onClick={() => sendCommand('back')} disabled={sending === 'back'} />
              <NavButton icon={Home} label={t('control.home')} onClick={() => sendCommand('home')} disabled={sending === 'home'} />
              <NavButton icon={LayoutGrid} label={t('control.recents')} onClick={() => sendCommand('recents')} disabled={sending === 'recents'} />
              <NavButton icon={Power} label={t('control.power')} onClick={() => sendCommand('power')} disabled={sending === 'power'} danger />
            </div>
            {/* Volume */}
            <div className="grid grid-cols-3 gap-2">
              <NavButton icon={Volume2} label={t('control.volume.up')} onClick={() => sendCommand('volume_up')} disabled={sending === 'volume_up'} />
              <NavButton icon={VolumeX} label={t('control.volume.down')} onClick={() => sendCommand('volume_down')} disabled={sending === 'volume_down'} />
              <NavButton icon={RotateCcw} label={t('control.reboot')} onClick={() => sendCommand('reboot')} disabled={sending === 'reboot'} danger />
            </div>
          </CardContent>
        </Card>

        {/* Keyboard + touch */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-sm flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              {t('control.keyboard')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                value={keyboardText}
                onChange={(e) => setKeyboardText(e.target.value)}
                placeholder={t('control.keyboard.placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendKeyboard()
                }}
                disabled={sending === 'text'}
              />
              <Button size="sm" onClick={sendKeyboard} disabled={!keyboardText.trim() || sending === 'text'} className="gap-1.5 w-full">
                <Send className="h-3 w-3" />
                {t('control.keyboard.send')}
              </Button>
            </div>
            <div className="border-t border-border/40 pt-4 space-y-3">
              <Label className="flex items-center gap-1.5 text-xs">
                <Crosshair className="h-3 w-3" />
                {t('control.touch')}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px]">{t('control.touch.x')}</Label>
                  <Input type="number" min={0} max={100} value={touchX} onChange={(e) => setTouchX(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">{t('control.touch.y')}</Label>
                  <Input type="number" min={0} max={100} value={touchY} onChange={(e) => setTouchY(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
              </div>
              {/* Preview position */}
              <div className="aspect-[9/16] max-w-[120px] mx-auto bg-foreground/5 rounded relative border border-border/40">
                <div
                  className="absolute w-3 h-3 rounded-full bg-primary -translate-x-1/2 -translate-y-1/2 transition-all"
                  style={{ left: `${touchX}%`, top: `${touchY}%` }}
                />
              </div>
              <Button size="sm" onClick={sendTouch} disabled={sending === 'touch'} variant="outline" className="gap-1.5 w-full">
                <Send className="h-3 w-3" />
                {t('control.touch.send')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event log */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif-display text-sm flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {t('control.eventlog')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">{t('control.eventlog.empty')}</div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
              {events.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-muted/40 text-xs">
                  <div className="font-mono text-muted-foreground">{new Date(e.timestamp).toLocaleString(locale)}</div>
                  <div className="font-mono">{e.command}</div>
                  <div className="font-mono text-muted-foreground truncate max-w-md flex-1">
                    {e.payload ? JSON.stringify(e.payload) : '—'}
                  </div>
                  <Badge variant={e.status === 'ok' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {e.status === 'ok' ? t('control.event.status.ok') : t('control.event.status.fail')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NavButton({ icon: Icon, label, onClick, disabled, danger }: { icon: any; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md border text-[10px] font-medium transition-colors disabled:opacity-50 ${
        danger
          ? 'border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'border-border text-foreground hover:bg-muted/50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
