'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { useDevice } from '../device-context'
import {
  MessageCircle,
  Instagram,
  Music2,
  Ghost,
  Send,
  AlertTriangle,
  Search,
  Image as ImageIcon,
  Mic,
  Volume2,
  X,
  ChevronLeft,
  Smartphone,
  Flag,
  Inbox,
  Camera,
  FileText,
  Video,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PLATFORM_ICONS: Record<string, any> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  tiktok: Music2,
  snapchat: Ghost,
  messenger: Send,
  telegram: Send,
  discord: MessageCircle,
  facebook: Instagram,
  sms: MessageCircle,
  other: MessageCircle,
}

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: 'bg-green-500',
  instagram: 'bg-gradient-to-br from-purple-500 to-pink-500',
  tiktok: 'bg-black dark:bg-white dark:text-black',
  snapchat: 'bg-yellow-400',
  messenger: 'bg-blue-500',
  telegram: 'bg-sky-500',
  discord: 'bg-indigo-500',
  facebook: 'bg-blue-600',
  sms: 'bg-gray-500',
  other: 'bg-gray-400',
}

const PLATFORM_TEXT: Record<string, string> = {
  whatsapp: 'text-green-600 dark:text-green-400',
  instagram: 'text-pink-600 dark:text-pink-400',
  tiktok: 'text-foreground',
  snapchat: 'text-yellow-600 dark:text-yellow-400',
  messenger: 'text-blue-600 dark:text-blue-400',
  telegram: 'text-sky-600 dark:text-sky-400',
  discord: 'text-indigo-600 dark:text-indigo-400',
  facebook: 'text-blue-700 dark:text-blue-400',
  sms: 'text-gray-600 dark:text-gray-400',
  other: 'text-gray-500 dark:text-gray-400',
}

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900',
  medium: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border-orange-200 dark:border-orange-900',
  high: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-900',
  critical: 'bg-red-600 text-white border-red-700',
}

interface NotificationDTO {
  id: string
  deviceId: string
  platform: string
  packageName: string
  title: string
  text: string
  hasImage: boolean
  imageBase64: string | null
  hasAudio: boolean
  audioUri: string | null
  audioBase64: string | null
  flagged: boolean
  flagReason: string | null
  severity: string | null
  timestamp: string
  linkedMediaId: string | null
  linkedMediaType: string | null
  linkedMediaThumb: string | null
  linkedMediaMime: string | null
}

/** Agrupa as notificações por "conversa" = plataforma + título normalizado. */
function conversationKey(n: NotificationDTO): string {
  // O título costuma trazer o nome do remetente (ex: "Maria" ou "Maria: olá").
  // Usamos só o primeiro segmento antes de ":" como identificador de conversa.
  const sender = (n.title || '').split(':')[0].trim().toLowerCase() || '(sem remetente)'
  return `${n.platform}::${sender}`
}

function senderDisplay(n: NotificationDTO): string {
  return (n.title || '').split(':')[0].trim() || '(sem remetente)'
}

function messageBody(n: NotificationDTO): string {
  if (n.text) return n.text
  const title = n.title || ''
  const idx = title.indexOf(':')
  return idx >= 0 ? title.slice(idx + 1).trim() : ''
}

type MediaHint = 'photo' | 'voice' | 'video' | 'audio' | 'file' | null

function detectMediaHint(n: NotificationDTO): MediaHint {
  const t = ((n.text || '') + ' ' + (n.title || '')).toLowerCase()
  if (n.hasImage || t.includes('📷') || t.includes('enviou uma foto') || t.includes('sent a photo') || t.includes('[img]')) return 'photo'
  if (t.includes('🎤') || t.includes('mensagem de voz') || t.includes('voice message') || t.includes('ptt')) return 'voice'
  if (t.includes('🎥') || t.includes('vídeo') || t.includes('video')) return 'video'
  if (n.hasAudio || t.includes('[audio]')) return 'audio'
  if (t.includes('📄') || t.includes('documento') || t.includes('document') || t.includes('ficheiro') || t.includes('file')) return 'file'
  return null
}

const MEDIA_HINT_CONFIG: Record<string, { icon: any; label: string; className: string }> = {
  photo: { icon: Camera, label: 'Foto', className: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/40' },
  voice: { icon: Mic, label: 'Mensagem de voz', className: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-950/40' },
  video: { icon: Video, label: 'Vídeo', className: 'text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-950/40' },
  audio: { icon: Volume2, label: 'Áudio', className: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-950/40' },
  file: { icon: FileText, label: 'Ficheiro', className: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40' },
}

function dateDividerLabel(ts: string, locale: string): string {
  const d = new Date(ts)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatRelative(ts: string, locale: string, t: (k: string, p?: any) => string): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return t('notifications.time.ago', { min: diffMin })
  if (isToday) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (isYesterday) return t('notifications.yesterday')
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}

export function NotificationsView() {
  const { t, locale } = useI18n()
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeConvKey, setActiveConvKey] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const { selectedDeviceId, activeDevices } = useDevice()

  const { data, loading, refresh } = useFetch<{ events: NotificationDTO[] }>(
    `/api/dashboard/notifications?limit=200${flaggedOnly ? '&flagged=true' : ''}${selectedPlatform ? `&platform=${selectedPlatform}` : ''}${selectedDeviceId ? `&deviceId=${selectedDeviceId}` : ''}`,
    { refreshMs: 15000, deps: [flaggedOnly, selectedPlatform, selectedDeviceId] }
  )
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    if (rtEvents.some(e => e.type === 'notification' || e.type === 'alert')) refresh()
  }, [rtEvents, refresh])

  // Deduplicate: remove notifications with same title+text within 5 seconds
  const events = useMemo(() => {
    const raw = data?.events ?? []
    const seen = new Map<string, number>()
    return raw.filter(e => {
      const key = `${e.title}|${e.text}`
      const ts = new Date(e.timestamp).getTime()
      const prev = seen.get(key)
      if (prev !== undefined && Math.abs(ts - prev) < 5000) return false
      seen.set(key, ts)
      return true
    })
  }, [data?.events])
  const threadRef = useRef<HTMLDivElement>(null)

  // Agrupa por conversa, ordena por última atividade
  const conversations = useMemo(() => {
    const map = new Map<string, { key: string; platform: string; sender: string; items: NotificationDTO[]; flaggedCount: number; lastTs: number }>()
    for (const e of events) {
      // filtro de pesquisa (remetente ou texto)
      if (search) {
        const q = search.toLowerCase()
        const hay = (senderDisplay(e) + ' ' + e.text + ' ' + e.title).toLowerCase()
        if (!hay.includes(q)) continue
      }
      const key = conversationKey(e)
      const entry = map.get(key) ?? { key, platform: e.platform, sender: senderDisplay(e), items: [], flaggedCount: 0, lastTs: 0 }
      entry.items.push(e)
      if (e.flagged) entry.flaggedCount++
      const ts = new Date(e.timestamp).getTime()
      if (ts > entry.lastTs) entry.lastTs = ts
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs)
  }, [events, search])

  // Lista de plataformas únicas para os filtros
  const platforms = useMemo(
    () => Array.from(new Set(events.map(e => e.platform))),
    [events]
  )

  const activeConv = activeConvKey ? conversations.find(c => c.key === activeConvKey) : null

  // Stats para o cabeçalho
  const stats = useMemo(() => {
    const total = events.length
    const flagged = events.filter(e => e.flagged).length
    const lastTs = events.length ? events[0].timestamp : null
    return { total, flagged, platforms: platforms.length, lastTs }
  }, [events, platforms])

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)]">
        <div className="space-y-2"><Skeleton className="h-16 w-full" />{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        <Skeleton className="w-full h-full" />
      </div>
    )
  }

  if (events.length === 0) {
    const deviceLabel = selectedDeviceId
      ? (activeDevices.find(d => d.id === selectedDeviceId)?.childName ?? activeDevices.find(d => d.id === selectedDeviceId)?.name ?? 'este dispositivo')
      : 'todos os dispositivos'
    return (
      <EmptyState
        icon={Inbox}
        title={t('notifications.empty.title')}
        body={t('notifications.empty.body') + ` (${deviceLabel})`}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={MessageCircle} label={t('notifications.stat.total')} value={stats.total} tone="primary" />
        <MiniStat icon={AlertTriangle} label={t('notifications.stat.flagged')} value={stats.flagged} tone={stats.flagged > 0 ? 'danger' : 'default'} />
        <MiniStat icon={Smartphone} label={t('notifications.stat.platforms')} value={stats.platforms} tone="info" />
        <MiniStat
          icon={Inbox}
          label={t('notifications.stat.last')}
          value={stats.lastTs ? new Date(stats.lastTs).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—'}
          tone="default"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('notifications.filter.search')}
            className="pl-9 h-9"
          />
        </div>
        <Button
          size="sm"
          variant={flaggedOnly ? 'default' : 'outline'}
          onClick={() => setFlaggedOnly(!flaggedOnly)}
          className="gap-1.5 h-9"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {flaggedOnly ? t('notifications.filter.flagged') : t('notifications.filter.all')}
        </Button>
        {platforms.map(p => (
          <Button
            key={p}
            size="sm"
            variant={selectedPlatform === p ? 'default' : 'outline'}
            onClick={() => setSelectedPlatform(selectedPlatform === p ? null : p)}
            className="capitalize gap-1.5 h-9"
          >
            {(() => { const Icon = PLATFORM_ICONS[p] ?? MessageCircle; return <Icon className="h-3.5 w-3.5" /> })()}
            {p}
          </Button>
        ))}
      </div>

      {/* Inbox: rail + thread */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4" style={{ height: 'calc(100vh - 340px)', minHeight: '460px' }}>
        {/* Rail de conversas */}
        <Card className="border-border/60 shadow-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border/60 bg-muted/30">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5" />
              {t('notifications.conversations')}
              <Badge variant="secondary" className="ml-auto text-[10px]">{conversations.length}</Badge>
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-0.5">
              {conversations.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">{t('notifications.thread.empty.body')}</div>
              )}
              {conversations.map(conv => {
                const Icon = PLATFORM_ICONS[conv.platform] ?? MessageCircle
                const last = conv.items[conv.items.length - 1]
                const isActive = activeConvKey === conv.key
                return (
                  <button
                    key={conv.key}
                    onClick={() => setActiveConvKey(conv.key)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group',
                      isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/60'
                    )}
                  >
                    <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white', PLATFORM_COLORS[conv.platform] ?? 'bg-gray-400')}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{conv.sender}</span>
                        <span className={cn('text-[10px] font-medium capitalize', PLATFORM_TEXT[conv.platform] ?? 'text-muted-foreground')}>{conv.platform}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatRelative(new Date(conv.lastTs).toISOString(), locale, t)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                        {(() => {
                          const hint = detectMediaHint(last)
                          if (hint) {
                            const cfg = MEDIA_HINT_CONFIG[hint]
                            const HintIcon = cfg.icon
                            return <><HintIcon className="h-3 w-3 shrink-0 opacity-70" /><span className="truncate">{cfg.label}{last.linkedMediaId ? '' : ' (pendente)'}</span></>
                          }
                          const body = messageBody(last)
                          return <span className="truncate">{body || t('notifications.no.text')}</span>
                        })()}
                      </div>
                    </div>
                    {conv.flaggedCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 px-1 items-center justify-center text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground shrink-0">
                        {conv.flaggedCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Thread de mensagens */}
        <Card className="border-border/60 shadow-card flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {activeConv ? (
            <>
              {/* Cabeçalho da thread */}
              <div className="px-4 py-3 border-b border-border/60 bg-muted/30 flex items-center gap-3 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden h-8 w-8 p-0"
                  onClick={() => setActiveConvKey(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {(() => {
                  const Icon = PLATFORM_ICONS[activeConv.platform] ?? MessageCircle
                  return (
                    <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white', PLATFORM_COLORS[activeConv.platform] ?? 'bg-gray-400')}>
                      <Icon className="h-4 w-4" />
                    </div>
                  )
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{activeConv.sender}</span>
                    <span className={cn('text-[10px] font-medium capitalize', PLATFORM_TEXT[activeConv.platform] ?? 'text-muted-foreground')}>{activeConv.platform}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {activeConv.items.length} mensagens{activeConv.flaggedCount > 0 && ` · ${activeConv.flaggedCount} sinalizadas`}
                  </div>
                </div>
                {activeConv.flaggedCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <Flag className="h-3 w-3" />
                    {activeConv.flaggedCount}
                  </Badge>
                )}
              </div>

              {/* Mensagens (style chat, cronológico, agrupadas por data) */}
              <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                <div ref={threadRef} className="p-4 flex flex-col gap-3">
                  {(() => {
                    const sorted = activeConv.items
                      .slice()
                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    let lastDateStr = ''
                    const nodes: React.ReactNode[] = []
                    for (const n of sorted) {
                      const flagged = n.flagged
                      const dateStr = new Date(n.timestamp).toDateString()
                      const showDateDivider = dateStr !== lastDateStr
                      lastDateStr = dateStr
                      const mediaHint = detectMediaHint(n)
                      const hintCfg = mediaHint ? MEDIA_HINT_CONFIG[mediaHint] : null
                      const body = messageBody(n)

                      if (showDateDivider) {
                        nodes.push(
                          <div key={`date-${n.id}`} className="flex items-center gap-3 my-3 first:mt-0">
                            <div className="flex-1 h-px bg-border/50" />
                            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60">
                              <Calendar className="h-3 w-3" />
                              {dateDividerLabel(n.timestamp, locale)}
                            </span>
                            <div className="flex-1 h-px bg-border/50" />
                          </div>
                        )
                      }

                      nodes.push(
                        <div
                          key={n.id}
                          className={cn(
                            'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                            flagged
                              ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-bl-sm'
                              : 'bg-muted/80 rounded-bl-sm'
                          )}
                        >
                          {/* hora + alerta */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[11px] text-muted-foreground font-medium">
                              {new Date(n.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {flagged && (
                              <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border', SEVERITY_STYLES[n.severity ?? 'medium'] ?? SEVERITY_STYLES.medium)}>
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {n.flagReason ?? t('notifications.flagged.badge')}
                              </span>
                            )}
                          </div>

                          {/* corpo da mensagem */}
                          {body ? (
                            <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                              {body}
                            </p>
                          ) : (
                            <p className="text-muted-foreground italic text-xs">{t('notifications.no.text')}</p>
                          )}

                          {/* imagem capturada inline */}
                          {n.imageBase64 && (
                            <button
                              onClick={() => setLightboxImage(n.imageBase64)}
                              className="mt-2.5 block rounded-xl overflow-hidden border border-border/40 hover:opacity-90 transition-opacity cursor-zoom-in"
                            >
                              <img
                                src={`data:image/jpeg;base64,${n.imageBase64}`}
                                alt="Foto"
                                className="max-w-[280px] max-h-[220px] object-cover"
                                loading="lazy"
                              />
                            </button>
                          )}

                          {/* áudio capturado inline */}
                          {n.audioBase64 && (
                            <div className="mt-2.5 flex items-center gap-2 bg-purple-50 dark:bg-purple-950/30 rounded-xl px-3 py-2.5">
                              <Mic className="h-4 w-4 text-purple-500 shrink-0" />
                              <audio
                                controls
                                preload="metadata"
                                className="h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent"
                                src={`data:audio/ogg;base64,${n.audioBase64}`}
                              />
                            </div>
                          )}

                          {/* Media linkado do MediaReporter (foto/vídeo/áudio real do dispositivo) */}
                          {!n.imageBase64 && !n.audioBase64 && n.linkedMediaId && (
                            <div className="mt-2.5">
                              {n.linkedMediaType === 'photo' && n.linkedMediaThumb ? (
                                <button
                                  onClick={() => setLightboxImage(n.linkedMediaThumb!.replace('data:image/jpeg;base64,', ''))}
                                  className="block rounded-xl overflow-hidden border border-border/40 hover:opacity-90 transition-opacity cursor-zoom-in"
                                >
                                  <img
                                    src={n.linkedMediaThumb}
                                    alt="Foto"
                                    className="max-w-[280px] max-h-[220px] object-cover"
                                    loading="lazy"
                                  />
                                </button>
                              ) : n.linkedMediaType === 'video' ? (
                                <div className="rounded-xl overflow-hidden border border-border/40 max-w-[320px]">
                                  <video
                                    controls
                                    preload="metadata"
                                    className="w-full max-h-[220px]"
                                    src={`/api/dashboard/media/file?id=${n.linkedMediaId}`}
                                  />
                                </div>
                              ) : n.linkedMediaType === 'audio' ? (
                                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 rounded-xl px-3 py-2.5">
                                  <Volume2 className="h-4 w-4 text-green-500 shrink-0" />
                                  <audio
                                    controls
                                    preload="metadata"
                                    className="h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent"
                                    src={`/api/dashboard/media/file?id=${n.linkedMediaId}`}
                                  />
                                </div>
                              ) : n.linkedMediaThumb ? (
                                <img
                                  src={n.linkedMediaThumb}
                                  alt="Media"
                                  className="max-w-[280px] max-h-[220px] object-cover rounded-xl"
                                  loading="lazy"
                                />
                              ) : null}
                            </div>
                          )}

                          {/* media hint (sem conteúdo disponível) */}
                          {hintCfg && !n.imageBase64 && !n.audioBase64 && !n.linkedMediaId && (
                            <div className={cn('mt-2 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5', hintCfg.className)}>
                              <hintCfg.icon className="h-3.5 w-3.5" />
                              {hintCfg.label}
                            </div>
                          )}
                        </div>
                      )
                    }
                    return nodes
                  })()}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <div className="h-16 w-16 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-7 w-7" />
                </div>
                <h3 className="font-serif-display text-lg text-foreground mb-1">{t('notifications.thread.empty.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('notifications.thread.empty.body')}</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Lightbox de imagem */}
      <Dialog open={!!lightboxImage} onOpenChange={open => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95 border-border/20">
          <DialogTitle className="sr-only">{t('notifications.image')}</DialogTitle>
          {lightboxImage && (
            <div className="relative flex items-center justify-center">
              <img
                src={`data:image/jpeg;base64,${lightboxImage}`}
                alt={t('notifications.image')}
                className="max-h-[80vh] w-auto object-contain"
              />
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 right-3 h-8 w-8 rounded-full"
                onClick={() => setLightboxImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: 'default' | 'primary' | 'danger' | 'info' }) {
  const toneClasses = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  }[tone]
  return (
    <Card className="border-border/60 shadow-soft">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', toneClasses)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{label}</div>
          <div className="font-serif-display text-lg leading-none text-foreground mt-0.5 truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}
