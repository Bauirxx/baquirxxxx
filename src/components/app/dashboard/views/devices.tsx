'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { toast } from 'sonner'
import {
  Smartphone,
  Copy,
  Check,
  Ban,
  Eye,
  EyeOff,
  Usb,
  Wifi,
  Globe,
  QrCode,
  Download,
  Link2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { DeviceDTO, TailscaleStatusDTO } from '@/lib/types'

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  offline: 'bg-muted text-muted-foreground',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

export function DevicesView() {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ devices: DeviceDTO[]; byConnection: Record<string, DeviceDTO[]> }>('/api/dashboard/devices', {
    refreshMs: 30000,
  })
  const { data: tailscale, loading: tsLoading } = useFetch<TailscaleStatusDTO>('/api/dashboard/tailscale', { refreshMs: 60000 })
  const [revealedCode, setRevealedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [pairingPeer, setPairingPeer] = useState<string | null>(null)
  const [pairedPeer, setPairedPeer] = useState<string | null>(null)

  useEffect(() => {
    // window só existe no cliente → lido após montar (evita hydration mismatch no QR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin)
  }, [])

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
    } else {
      toast.error(t('toast.error'))
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  const devices = data?.devices ?? []
  const byConnection = data?.byConnection ?? { usb: [], wifi: [], tailscale: [], companion: [] }

  // Alvo do QR de emparelhamento: o 1.º dispositivo pendente, senão o mais recente.
  const pairTarget = devices.find((d) => d.status === 'pending') ?? devices[0]

  // Endereço do servidor no QR: preferir o IP do Tailscale (alcançável por
  // dispositivos de teste sem endereço público); caso contrário, o origin atual.
  const tsIp = tailscale?.thisDeviceIp ?? null
  let serverForPairing = origin
  if (tsIp && origin) {
    try {
      const u = new URL(origin)
      serverForPairing = `http://${tsIp}${u.port ? `:${u.port}` : ''}`
    } catch {
      /* origin inválido — mantém o valor atual */
    }
  }

  const pairingValue = JSON.stringify({
    v: 1,
    type: 'screenporter-pair',
    server: serverForPairing,
    code: pairTarget?.installCode ?? '',
    deviceId: pairTarget?.id ?? '',
  })

  // Associa um peer da Tailnet ao dispositivo pendente (alternativa ao QR).
  async function associatePeer(peer: TailscaleStatusDTO['peers'][number]) {
    if (!pairTarget || !peer.ip) return
    setPairingPeer(peer.ip)
    try {
      const res = await fetch('/api/dashboard/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pairTailscale', deviceId: pairTarget.id, ip: peer.ip, hostname: peer.hostname }),
      })
      if (res.ok) {
        setPairedPeer(peer.ip)
        toast.success(t('toast.ts.paired'))
        refresh()
        setTimeout(() => setPairedPeer(null), 2000)
      } else {
        toast.error(t('toast.error'))
      }
    } catch {
      toast.error(t('toast.error'))
    } finally {
      setPairingPeer(null)
    }
  }

  if (!devices.length) {
    return (
      <EmptyState
        icon={Smartphone}
        title={t('devices.empty.title')}
        body={t('devices.empty.body')}
      />
    )
  }

  // Renderiza uma secção por tipo de ligação
  const CONNECTION_SECTIONS: Array<{ key: string; icon: any; tone: string }> = [
    { key: 'usb', icon: Usb, tone: 'text-blue-600 dark:text-blue-400' },
    { key: 'wifi', icon: Wifi, tone: 'text-cyan-600 dark:text-cyan-400' },
    { key: 'tailscale', icon: Globe, tone: 'text-purple-600 dark:text-purple-400' },
    { key: 'companion', icon: Smartphone, tone: 'text-primary' },
  ]

  return (
    <div className="space-y-4">
      {CONNECTION_SECTIONS.map(({ key, icon: Icon, tone }) => {
        const sectionDevices = byConnection[key] ?? []
        if (sectionDevices.length === 0) return null
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${tone}`} />
              {t(`devices.section.${key}`)}
              <span className="ml-auto inline-flex h-4 min-w-4 px-1 items-center justify-center text-[10px] font-bold rounded-full bg-muted text-muted-foreground">
                {sectionDevices.length}
              </span>
            </div>
            <Card className="border-border/60 shadow-none">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('devices.col.name')}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t('devices.col.child')}</TableHead>
                      <TableHead className="w-24">{t('devices.col.status')}</TableHead>
                      <TableHead className="w-32 hidden md:table-cell">{t('devices.col.install')}</TableHead>
                      <TableHead className="w-28 hidden lg:table-cell">{t('devices.col.ip')}</TableHead>
                      <TableHead className="w-32 hidden lg:table-cell">{t('devices.col.lastSeen')}</TableHead>
                      <TableHead className="w-24 text-right">{t('devices.col.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectionDevices.map(d => {
                      const isRevealed = revealedCode === d.id
                      const isCopied = copied === d.installCode
                      return (
                        <TableRow key={d.id}>
                          <TableCell>
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-muted-foreground">{d.model} · {d.osVersion}</div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {d.childName ?? '—'}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONES[d.status] ?? STATUS_TONES.offline}`}>
                              {t(`devices.status.${d.status}`)}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1 font-mono text-sm">
                              <span className={isRevealed ? '' : 'blur-sm select-none'}>
                                {d.installCode}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setRevealedCode(isRevealed ? null : d.id)}
                              >
                                {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              {isRevealed && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyCode(d.installCode)}
                                >
                                  {isCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
                            {d.ipAddress ? `${d.ipAddress}${d.port ? `:${d.port}` : ''}` : '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                            {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString(locale) : t('devices.never')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {d.status !== 'revoked' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmRevoke(d.id)}
                                  className="gap-1 text-destructive hover:text-destructive"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span className="hidden sm:inline">{t('devices.revoke')}</span>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )
      })}

      {/* Companion QR section */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="shrink-0 rounded-md bg-white p-3 border border-border/40">
              {origin ? (
                <QRCodeSVG
                  value={pairingValue}
                  size={120}
                  level="M"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                />
              ) : (
                <div className="h-[120px] w-[120px] flex items-center justify-center">
                  <QrCode className="h-16 w-16 text-foreground/30" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif-display text-base mb-1">{t('devices.companion.qr')}</h3>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                {t('devices.companion.qr.subtitle')}
              </p>
              {origin && (
                <p className="text-[11px] font-mono text-muted-foreground/70 mb-3 break-all">
                  {serverForPairing}{pairTarget ? `  ·  ${pairTarget.installCode}` : ''}
                  {tsIp ? '  · via Tailscale' : ''}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-3 w-3" />
                  {t('devices.companion.download')}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <Wifi className="h-3 w-3" />
                  {t('devices.pair.wifi')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scan da rede Tailscale — alternativa ao QR para aparelhos que não scanneiam */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h3 className="font-serif-display text-base">{t('devices.ts.scan.title')}</h3>
            {tailscale?.connected && tailscale.tailnetName && (
              <span className="ml-auto text-[11px] font-mono text-muted-foreground truncate max-w-[40%]">
                {tailscale.tailnetName}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {t('devices.ts.scan.subtitle')}
          </p>

          {tsLoading && !tailscale ? (
            <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : !tailscale?.installed || !tailscale?.connected ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('devices.ts.scan.notInstalled')}
            </p>
          ) : tailscale.peers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('devices.ts.scan.empty')}</p>
          ) : (
            <div className="space-y-1.5">
              {tailscale.peers.map((peer) => (
                <div
                  key={peer.ip || peer.hostname}
                  className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2"
                >
                  <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{peer.hostname}</div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {peer.ip}{peer.os ? ` · ${peer.os}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      peer.online
                        ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {peer.online ? t('devices.ts.online') : t('devices.status.offline')}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    disabled={!pairTarget || !peer.ip || pairingPeer === peer.ip}
                    title={!pairTarget ? t('devices.ts.noTarget') : undefined}
                    onClick={() => associatePeer(peer)}
                  >
                    <Link2 className="h-3 w-3" />
                    {pairedPeer === peer.ip ? t('devices.ts.associated') : t('devices.ts.associate')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke confirm */}
      <Dialog open={!!confirmRevoke} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('devices.revoke')}</DialogTitle>
            <DialogDescription>
              {t('settings.danger.delete.confirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => confirmRevoke && revoke(confirmRevoke)}>
              {t('devices.revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
