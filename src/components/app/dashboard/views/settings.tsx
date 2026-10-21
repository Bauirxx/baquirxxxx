'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  User as UserIcon,
  Scale,
  ShieldCheck,
  ScrollText,
  AlertTriangle,
  Loader2,
  Trash2,
  Ban,
  Globe,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import { useFetch } from '../use-fetch'
import type { Locale, Jurisdiction, SyncMode } from '@/lib/types'

interface SettingsData {
  user: { id: string; email: string; name: string; jurisdiction: Jurisdiction; locale: Locale }
  consentRecords: {
    id: string
    consentType: string
    jurisdiction: string
    legalVersion: string
    accepted: boolean
    ipAddress: string | null
    createdAt: string
  }[]
  auditLogs: {
    id: string
    action: string
    target: string | null
    metadata: string | null
    ipAddress: string | null
    createdAt: string
  }[]
  devicesCount: number
  children: { id: string; name: string }[]
  jurisdictions: {
    code: Jurisdiction
    label: Record<Locale, string>
    law: Record<Locale, string>
    ageOfConsent: number
    rightToBeForgotten: boolean
    requiresDPIA: boolean
  }[]
}

interface SettingsViewProps {
  user: { id: string; email: string; name: string; jurisdiction: Jurisdiction; locale: Locale }
  onLocaleChange: (l: Locale) => void
}

export function SettingsView({ user, onLocaleChange }: SettingsViewProps) {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<SettingsData>('/api/dashboard/settings', {
    refreshMs: 60000,
  })
  const [confirmChangeJ, setConfirmChangeJ] = useState<Jurisdiction | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  async function changeJurisdiction(newJ: Jurisdiction) {
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'changeJurisdiction', jurisdiction: newJ }),
      })
      if (res.ok) {
        toast.success(t('toast.saved'))
        setConfirmChangeJ(null)
        refresh()
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteAccount' }),
      })
      if (res.ok) {
        // Logout client-side
        await fetch('/api/auth/logout', { method: 'POST' })
        window.location.href = '/'
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const settings = data

  return (
    <div className="space-y-6">
      {/* Account */}
      <Card className="border-border/60 shadow-none">
        <CardHeader>
          <CardTitle className="font-serif-display text-lg flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            {t('settings.section.account')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('settings.account.name')}</div>
              <div className="text-sm font-medium">{user.name}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('settings.account.email')}</div>
              <div className="text-sm font-medium">{user.email}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('dashboard.language')}</div>
              <div className="flex gap-2">
                <Button
                  variant={locale === 'pt-BR' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onLocaleChange('pt-BR')}
                >
                  Português
                </Button>
                <Button
                  variant={locale === 'en' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onLocaleChange('en')}
                >
                  English
                </Button>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('settings.account.jurisdiction')}</div>
              <Badge variant="outline">{user.jurisdiction}</Badge>
              {settings && settings.children.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {settings.children.length} {settings.children.length === 1 ? 'criança' : 'crianças'}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jurisdição ativa */}
      {settings && (
        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="font-serif-display text-lg flex items-center gap-2">
              <Scale className="h-4 w-4" />
              {t('settings.section.jurisdiction')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              {settings.jurisdictions.map(j => (
                <button
                  key={j.code}
                  onClick={() => j.code !== user.jurisdiction && setConfirmChangeJ(j.code)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    j.code === user.jurisdiction
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border hover:border-border/80 hover:bg-muted/40'
                  }`}
                >
                  <div className="font-medium text-sm">{j.label[locale]}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{j.law[locale]}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Age {j.ageOfConsent} · Erasure: {j.rightToBeForgotten ? '✓' : '✗'}
                    {j.requiresDPIA ? ' · DPIA ✓' : ''}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Consent records */}
      {settings && (
        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="font-serif-display text-lg flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              {t('settings.section.consent')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {settings.consentRecords.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4">{t('settings.consent.empty')}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('settings.consent.col.type')}</TableHead>
                    <TableHead className="w-20">{t('settings.consent.col.jurisdiction')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('settings.consent.col.version')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('settings.consent.col.ip')}</TableHead>
                    <TableHead className="w-32 text-right">{t('settings.consent.col.date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.consentRecords.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium capitalize">{r.consentType}</TableCell>
                      <TableCell><Badge variant="outline">{r.jurisdiction}</Badge></TableCell>
                      <TableCell className="hidden sm:table-cell text-xs font-mono">{r.legalVersion}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{r.ipAddress ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {new Date(r.createdAt).toLocaleString(locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit log */}
      {settings && (
        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="font-serif-display text-lg flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              {t('settings.section.audit')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {settings.auditLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4">{t('settings.audit.empty')}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-40">{t('settings.audit.col.action')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('settings.audit.col.target')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('settings.audit.col.ip')}</TableHead>
                    <TableHead className="w-32 text-right">{t('settings.audit.col.date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.auditLogs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.action}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground">{l.target ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{l.ipAddress ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {new Date(l.createdAt).toLocaleString(locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ScreenPorter — Tailscale status */}
      <TailscaleSection user={user} />

      {/* ScreenPorter — Sync config */}
      <SyncConfigSection user={user} />

      {/* Danger zone */}
      <Alert className="border-red-500/40 bg-red-50 dark:bg-red-950/20">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        <AlertTitle className="font-serif-display text-red-700 dark:text-red-300">{t('settings.section.dangerzone')}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button variant="outline" size="sm" className="border-red-500/40 text-red-700 dark:text-red-300 gap-1" disabled={busy}>
              <Ban className="h-3 w-3" />
              {t('settings.danger.revoke')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} className="gap-1">
              <Trash2 className="h-3 w-3" />
              {t('settings.danger.delete')}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Confirm dialogs */}
      <Dialog open={!!confirmChangeJ} onOpenChange={(o) => !o && setConfirmChangeJ(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('settings.section.jurisdiction')}</DialogTitle>
            <DialogDescription>{t('settings.account.jurisdiction.change')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmChangeJ(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button onClick={() => confirmChangeJ && changeJurisdiction(confirmChangeJ)} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('settings.danger.delete')}</DialogTitle>
            <DialogDescription>{t('settings.danger.delete.confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={deleteAccount} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// ScreenPorter — secção de Tailscale
// ============================================================
function TailscaleSection({ user: _user }: { user: { id: string } }) {
  const { t, locale } = useI18n()
  const { data, loading } = useFetch<{
    installed: boolean
    connected: boolean
    version: string | null
    tailnetName: string | null
    thisDeviceIp: string | null
    thisDeviceName: string | null
    peers: Array<{ hostname: string; ip: string; os: string; online: boolean }>
  }>('/api/dashboard/tailscale')

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="font-serif-display text-lg flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t('settings.section.remote')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : data ? (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-border/40 bg-muted/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t('settings.tailscale.installed')}</div>
                <div className="text-sm font-medium mt-0.5">
                  {data.installed ? <span className="text-green-600 dark:text-green-400">✓</span> : <span className="text-red-600 dark:text-red-400">✗</span>}
                </div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t('settings.tailscale.connected')}</div>
                <div className="text-sm font-medium mt-0.5">
                  {data.connected
                    ? <span className="text-green-600 dark:text-green-400">{t('settings.tailscale.connected')}</span>
                    : <span className="text-red-600 dark:text-red-400">{t('settings.tailscale.disconnected')}</span>}
                </div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t('settings.tailscale.version')}</div>
                <div className="text-sm font-mono mt-0.5">{data.version ?? '—'}</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-md border border-border/40 bg-muted/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t('settings.tailscale.tailnet')}</div>
                <div className="text-sm font-mono mt-0.5">{data.tailnetName ?? '—'}</div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t('settings.tailscale.thisDevice')}</div>
                <div className="text-sm font-mono mt-0.5">
                  {data.thisDeviceName} <span className="text-muted-foreground">·</span> {data.thisDeviceIp}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {t('settings.tailscale.peers')}
              </div>
              {data.peers.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('settings.tailscale.empty')}</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {data.peers.map(p => (
                    <div
                      key={p.ip}
                      className="flex items-center gap-2 p-2 rounded-md border border-border/40"
                    >
                      <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono truncate">{p.hostname}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{p.ip} · {p.os}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ============================================================
// ScreenPorter — secção de sync config
// ============================================================
function SyncConfigSection({ user: _user }: { user: { id: string } }) {
  const { t } = useI18n()
  const { data, refresh } = useFetch<{
    mode: 'rigid' | 'adaptive' | 'independent'
    toleranceMs: number
    marginMs: number
    elementBased: boolean
  }>('/api/dashboard/sync')
  const [busy, setBusy] = useState(false)

  async function update(field: string, value: any) {
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        toast.success(t('toast.saved'))
        refresh()
      } else {
        toast.error(t('toast.error'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="font-serif-display text-lg flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('settings.section.sync')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-border/40 bg-muted/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t('settings.sync.mode')}</div>
            <div className="text-sm font-medium mt-0.5 capitalize">{data.mode}</div>
          </div>
          <div className="rounded-md border border-border/40 bg-muted/30 p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t('settings.sync.elementBased')}</div>
              <div className="text-sm font-medium mt-0.5">{data.elementBased ? '✓' : '✗'}</div>
            </div>
            <Switch
              checked={data.elementBased}
              onCheckedChange={(v) => update('elementBased', v)}
              disabled={busy}
            />
          </div>
          <div className="rounded-md border border-border/40 bg-muted/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t('settings.sync.tolerance')}</div>
            <div className="text-sm font-mono mt-0.5">{data.toleranceMs}ms</div>
          </div>
          <div className="rounded-md border border-border/40 bg-muted/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t('settings.sync.margin')}</div>
            <div className="text-sm font-mono mt-0.5">{data.marginMs}ms</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
