'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { Jurisdiction, Locale } from '@/lib/types'
import {
  Smartphone,
  Usb,
  Wifi,
  Globe,
  QrCode,
  Download,
  Ban,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Phone,
  MessageSquare,
  Clock,
  Image as ImageIcon,
  AlertTriangle,
  Siren,
  MonitorPlay,
  Activity,
} from 'lucide-react'
import type { DeviceDTO, DashboardView } from '@/lib/types'

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  offline: 'bg-muted text-muted-foreground',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

const CONN_ICONS: Record<string, any> = {
  usb: Usb,
  wifi: Wifi,
  tailscale: Globe,
  companion: Smartphone,
}

const CONN_COLORS: Record<string, string> = {
  usb: 'text-blue-600 dark:text-blue-400',
  wifi: 'text-cyan-600 dark:text-cyan-400',
  tailscale: 'text-purple-600 dark:text-purple-400',
  companion: 'text-primary',
}

interface DeviceStats {
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
  notifications: number
  media: number
  totalEvents: number
}

interface DeviceWithStats extends DeviceDTO {
  stats: DeviceStats
}

interface DevicesViewProps {
  user: { id: string; email: string; name: string; jurisdiction: Jurisdiction; locale: Locale }
}

export function DevicesView({ user }: DevicesViewProps) {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ devices: DeviceWithStats[] }>(
    '/api/dashboard/device-storage',
    { refreshMs: 10000 }
  )
  const { data: tsData } = useFetch<{
    installed: boolean
    connected: boolean
    thisDeviceIp: string | null
  }>('/api/dashboard/tailscale')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [revealedCode, setRevealedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [setupQrFor, setSetupQrFor] = useState<string | null>(null)
  const [pairToken, setPairToken] = useState<string | null>(null)
  const [pairTokenLoading, setPairTokenLoading] = useState(false)

  // Host base para os links no telemóvel:
  // - Preferência: IP do Tailscale (acessível de qualquer dispositivo na tailnet).
  // - Fallback: hostname atual do browser (útil em LAN/localhost).
  const [originHost, setOriginHost] = useState<string>('')
  useEffect(() => {
    if (typeof window !== 'undefined') setOriginHost(window.location.hostname)
  }, [])
  const hostForPhone = tsData?.thisDeviceIp || originHost || 'localhost'
  const apkUrl = `http://${hostForPhone}:3000/api/download/companion`

  async function copyText(text: string, successKey: string = 'toast.copied') {
    await navigator.clipboard.writeText(text)
    setCopied(text)
    toast.success(t(successKey))
    setTimeout(() => setCopied(null), 1800)
  }

  // Ao abrir o diálogo "Configurar via QR", pedir ao servidor um token de sessão
  // novo para o device. Esse token é embebido no QR e permite à app autenticar no
  // WebSocket + ingest sem digitar senha.
  useEffect(() => {
    if (!setupQrFor) {
      setPairToken(null)
      return
    }
    setPairTokenLoading(true)
    setPairToken(null)
    fetch('/api/dashboard/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pairToken', deviceId: setupQrFor }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setPairToken(d.token))
      .catch(() => toast.error(t('toast.error')))
      .finally(() => setPairTokenLoading(false))
  }, [setupQrFor, t])

  const devices = data?.devices ?? []

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopied(code)
    toast.success(t('toast.copied'))
    setTimeout(() => setCopied(null), 1800)
  }

  async function revoke(deviceId: string) {
    const res = await fetch('/api/dashboard/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', deviceId }),
    })
    if (res.ok) {
      toast.success(t('toast.device.revoked'))
      setConfirmRevoke(null)
      refresh()
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    )
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Smartphone}
        title={t('devices.empty.title')}
        body={t('devices.empty.body')}
      />
    )
  }

  return (
    <div className="space-y-4">
      {devices.map(d => {
        const isExpanded = expandedId === d.id
        const ConnIcon = CONN_ICONS[d.connectionType] ?? Smartphone
        const connColor = CONN_COLORS[d.connectionType] ?? 'text-primary'
        const s = d.stats

        return (
          <Card key={d.id} className="border-border/60 shadow-none overflow-hidden">
            {/* Header do dispositivo — sempre visível */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : d.id)}
              className="w-full p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${connColor} bg-muted/40`}>
                <ConnIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{d.name}</span>
                  <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONES[d.status] ?? STATUS_TONES.offline}`}>
                    {t(`devices.status.${d.status}`)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {d.model} · {d.osVersion} · {t(`connection.${d.connectionType}`)}
                  {d.ipAddress && ` · ${d.ipAddress}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 text-xs">
                  <Stat icon={MapPin} count={s.locations} color="text-blue-500" />
                  <Stat icon={Phone} count={s.calls} color="text-green-500" />
                  <Stat icon={MessageSquare} count={s.sms + s.notifications} color="text-purple-500" />
                  <Stat icon={ImageIcon} count={s.media} color="text-orange-500" />
                  <Stat icon={AlertTriangle} count={s.alerts} color="text-red-500" />
                </div>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {/* Conteúdo expandível — detalhes do dispositivo */}
            {isExpanded && (
              <div className="border-t border-border/40 p-4 space-y-4 animate-fade-in">
                {/* Grid de estatísticas detalhadas */}
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                  <StatCard icon={MapPin} label="GPS" count={s.locations} color="text-blue-500" />
                  <StatCard icon={Phone} label="Calls" count={s.calls} color="text-green-500" />
                  <StatCard icon={MessageSquare} label="SMS" count={s.sms} color="text-purple-500" />
                  <StatCard icon={MessageSquare} label="Notif" count={s.notifications} color="text-pink-500" />
                  <StatCard icon={Clock} label="Apps" count={s.appUsage} color="text-cyan-500" />
                  <StatCard icon={Activity} label="Web" count={s.browser} color="text-indigo-500" />
                  <StatCard icon={AlertTriangle} label="Alertas" count={s.alerts} color="text-red-500" />
                  <StatCard icon={Siren} label="SOS" count={s.sos} color="text-red-600" />
                  <StatCard icon={ImageIcon} label="Mídia" count={s.media} color="text-orange-500" />
                  <StatCard icon={MonitorPlay} label="Ecrã" count={s.screenSessions} color="text-teal-500" />
                  <StatCard icon={Eye} label="Shots" count={s.screenshots} color="text-amber-500" />
                  <StatCard icon={Smartphone} label="Apps Inst." count={s.installedApps} color="text-gray-500" />
                </div>

                {/* Código de instalação + ações */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Código:</span>
                    <code className="text-sm font-mono px-2 py-1 rounded bg-muted">
                      {revealedCode === d.id ? d.installCode : '••••••'}
                    </code>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setRevealedCode(revealedCode === d.id ? null : d.id)}>
                      {revealedCode === d.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    {revealedCode === d.id && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyCode(d.installCode)}>
                        {copied === d.installCode ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {d.screenW}×{d.screenH}px
                  </div>
                  {d.lastSeenAt && (
                    <div className="text-xs text-muted-foreground">
                      Visto: {new Date(d.lastSeenAt).toLocaleString(locale)}
                    </div>
                  )}
                  {d.status !== 'revoked' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setSetupQrFor(d.id)} className="ml-auto gap-1">
                        <QrCode className="h-3 w-3" />
                        Configurar via QR
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(d.id)} className="gap-1 text-destructive">
                        <Ban className="h-3 w-3" />
                        {t('devices.revoke')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {/* QR Companion — Download da APK */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-32 h-32 bg-white p-2 rounded-md flex items-center justify-center border border-border/40">
              <QRCodeSVG value={apkUrl} size={112} level="M" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif-display text-base mb-1">{t('devices.companion.qr')}</h3>
              <p className="text-xs text-muted-foreground mb-2">{t('devices.companion.qr.subtitle')}</p>
              <code className="block text-[10px] font-mono bg-muted px-2 py-1 rounded mb-3 truncate">
                {apkUrl}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <a href={apkUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3 w-3" />
                    {t('devices.companion.download')}
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => copyText(apkUrl)}
                >
                  {copied === apkUrl ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                  Copiar link
                </Button>
              </div>
              {!tsData?.thisDeviceIp && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Tailscale não detetado — o link usa <code className="font-mono">{originHost || 'localhost'}</code>. Liga o Tailscale no PC para obter um IP 100.x alcançável a partir do telemóvel.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: QR de setup por dispositivo (screenporter://setup?...) */}
      {setupQrFor && (() => {
        const dev = devices.find(d => d.id === setupQrFor)
        if (!dev) return null
        const deepLink = pairToken
          ? `screenporter://setup?server=${encodeURIComponent(`${hostForPhone}:8820`)}` +
            `&user=${encodeURIComponent(user.email)}` +
            `&token=${encodeURIComponent(pairToken)}` +
            `&jurisdiction=${encodeURIComponent(user.jurisdiction)}`
          : ''
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSetupQrFor(null)}>
            <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-serif-display text-lg">Associar {dev.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Na app Companion instalada, abre o scanner de QR e aponta para este código. Endereço, utilizador e token ficam preenchidos — não é preciso digitar a senha.
                  </p>
                </div>
                <div className="flex justify-center p-4 bg-white rounded-md min-h-[256px] items-center">
                  {pairTokenLoading ? (
                    <div className="text-sm text-muted-foreground">A gerar token...</div>
                  ) : pairToken ? (
                    <QRCodeSVG value={deepLink} size={224} level="M" />
                  ) : (
                    <div className="text-sm text-destructive">Erro a gerar token</div>
                  )}
                </div>
                {pairToken && (
                  <code className="block text-[10px] font-mono bg-muted px-2 py-1 rounded break-all">
                    {deepLink}
                  </code>
                )}
                <div className="flex gap-2 justify-end">
                  {pairToken && (
                    <Button variant="ghost" size="sm" onClick={() => copyText(deepLink)} className="gap-1">
                      {copied === deepLink ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      Copiar
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSetupQrFor(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Confirm revoke */}
      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmRevoke(null)}>
          <Card className="max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-serif-display text-lg">{t('devices.revoke')}</h3>
              <p className="text-sm text-muted-foreground">{t('settings.danger.delete.confirm')}</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(null)}>{t('common.cancel')}</Button>
                <Button variant="destructive" size="sm" onClick={() => revoke(confirmRevoke)}>{t('devices.revoke')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, count, color }: { icon: any; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="font-mono text-xs">{count}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, count, color }: { icon: any; label: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-md border border-border/40 hover:bg-muted/30 transition-colors">
      <Icon className={`h-4 w-4 ${color}`} />
      <div className="text-xs font-mono text-foreground">{count}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}
