'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useDevice } from '../device-context'
import {
  Image as ImageIcon,
  Video,
  Music,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Film,
  Library,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TYPE_ICONS: Record<string, any> = {
  photo: ImageIcon,
  video: Video,
  audio: Music,
}

const TYPE_COLORS: Record<string, string> = {
  photo: 'text-blue-500 bg-blue-100 dark:bg-blue-950/40',
  video: 'text-purple-500 bg-purple-100 dark:bg-purple-950/40',
  audio: 'text-green-500 bg-green-100 dark:bg-green-950/40',
}

interface MediaDTO {
  id: string
  deviceId: string
  type: string
  fileName: string
  mimeType: string
  sizeBytes: number
  thumbnail: string | null
  flagged: boolean
  flagReason: string | null
  source: string | null
  timestamp: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function MediaView() {
  const { t, locale } = useI18n()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const { selectedDeviceId, activeDevices } = useDevice()

  const { data, loading } = useFetch<{ media: MediaDTO[] }>(
    `/api/dashboard/media?limit=200${selectedType ? `&type=${selectedType}` : ''}${flaggedOnly ? '&flagged=true' : ''}${selectedDeviceId ? `&deviceId=${selectedDeviceId}` : ''}`,
    { refreshMs: 30000, deps: [selectedType, flaggedOnly, selectedDeviceId] }
  )

  const media = data?.media ?? []

  const stats = useMemo(() => {
    const total = media.length
    const flagged = media.filter(m => m.flagged).length
    const photos = media.filter(m => m.type === 'photo').length
    const size = media.reduce((acc, m) => acc + (m.sizeBytes || 0), 0)
    return { total, flagged, photos, size }
  }, [media])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const prev = useCallback(() => setLightboxIndex(i => (i === null ? null : (i - 1 + media.length) % media.length)), [media.length])
  const next = useCallback(() => setLightboxIndex(i => (i === null ? null : (i + 1) % media.length)), [media.length])

  // Navegação por teclado no lightbox
  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, closeLightbox, prev, next])

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
        </div>
      </div>
    )
  }

  if (media.length === 0) {
    const deviceLabel = selectedDeviceId
      ? (activeDevices.find(d => d.id === selectedDeviceId)?.childName ?? activeDevices.find(d => d.id === selectedDeviceId)?.name ?? 'este dispositivo')
      : 'todos os dispositivos'
    return (
      <EmptyState
        icon={ImageIcon}
        title={t('media.empty.title')}
        body={t('media.empty.body') + ` (${deviceLabel})`}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Library} label={t('media.stat.total')} value={stats.total} tone="primary" />
        <MiniStat icon={ImageIcon} label={t('media.stat.photos')} value={stats.photos} tone="info" />
        <MiniStat icon={AlertTriangle} label={t('media.stat.flagged')} value={stats.flagged} tone={stats.flagged > 0 ? 'danger' : 'default'} />
        <MiniStat icon={Download} label={t('media.stat.size')} value={formatSize(stats.size)} tone="default" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={flaggedOnly ? 'default' : 'outline'}
          onClick={() => setFlaggedOnly(!flaggedOnly)}
          className="gap-1.5 h-9"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {flaggedOnly ? t('media.filter.flagged') : t('media.filter.all')}
        </Button>
        {(['photo', 'video', 'audio'] as const).map(tp => {
          const Icon = TYPE_ICONS[tp]
          return (
            <Button
              key={tp}
              size="sm"
              variant={selectedType === tp ? 'default' : 'outline'}
              onClick={() => setSelectedType(selectedType === tp ? null : tp)}
              className="capitalize gap-1.5 h-9"
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`media.type.${tp}`)}
            </Button>
          )
        })}
      </div>

      {/* Galeria */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {media.map((m, idx) => {
          const Icon = TYPE_ICONS[m.type] ?? ImageIcon
          return (
            <Card
              key={m.id}
              className={cn(
                'gallery-item border-border/60 shadow-soft overflow-hidden cursor-pointer group',
                m.flagged && 'ring-2 ring-red-500/60'
              )}
              onClick={() => setLightboxIndex(idx)}
            >
              <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
                {m.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail} alt={m.fileName} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', TYPE_COLORS[m.type] ?? 'text-gray-400 bg-muted')}>
                    <Icon className="h-6 w-6" />
                  </div>
                )}

                {/* badge tipo (canto sup-esq) */}
                <div className="absolute top-1.5 left-1.5">
                  <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-white shadow-soft', m.type === 'photo' ? 'bg-blue-500' : m.type === 'video' ? 'bg-purple-500' : 'bg-green-500')}>
                    <Icon className="h-3 w-3" />
                  </span>
                </div>

                {/* badge flagged (canto sup-dir) */}
                {m.flagged && (
                  <div className="absolute top-1.5 right-1.5">
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white shadow-soft">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {m.flagReason ?? 'flag'}
                    </span>
                  </div>
                )}

                {/* overlay hover */}
                <div className="gallery-overlay absolute inset-0 bg-black/40 flex items-end p-2">
                  <div className="text-white text-[10px] font-mono leading-tight line-clamp-2 w-full">
                    {new Date(m.timestamp).toLocaleDateString(locale)}
                  </div>
                </div>

                {/* indicador vídeo (play) */}
                {m.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-9 w-9 rounded-full bg-black/60 flex items-center justify-center">
                      <Film className="h-4 w-4 text-white" />
                    </div>
                  </div>
                )}
              </div>
              <CardContent className="p-2">
                <div className="text-[10px] text-foreground truncate font-medium">{m.fileName}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-muted-foreground">{formatSize(m.sizeBytes)}</span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(m.timestamp).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxIndex !== null} onOpenChange={open => !open && closeLightbox()}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-border/20">
          <DialogTitle className="sr-only">{t('notifications.image')}</DialogTitle>
          {lightboxIndex !== null && media[lightboxIndex] && (
            <div className="relative flex items-center justify-center min-h-[300px]">
              {(() => {
                const m = media[lightboxIndex]
                const Icon = TYPE_ICONS[m.type] ?? ImageIcon
                const fileUrl = `/api/dashboard/media/file?id=${m.id}`
                return m.thumbnail || m.type === 'photo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail || fileUrl} alt={m.fileName} className="max-h-[78vh] w-auto object-contain" />
                ) : m.type === 'video' ? (
                  <video src={fileUrl} controls autoPlay className="max-h-[78vh] w-auto" />
                ) : m.type === 'audio' ? (
                  <div className="flex flex-col items-center gap-4 p-8">
                    <div className={cn('h-32 w-32 rounded-2xl flex items-center justify-center', TYPE_COLORS[m.type])}>
                      <Icon className="h-16 w-16" />
                    </div>
                    <audio src={fileUrl} controls autoPlay className="w-80" />
                  </div>
                ) : (
                  <div className={cn('h-32 w-32 rounded-2xl flex items-center justify-center', TYPE_COLORS[m.type] ?? 'text-gray-400 bg-muted')}>
                    <Icon className="h-16 w-16" />
                  </div>
                )
              })()}

              {/* Fechar */}
              <Button variant="secondary" size="icon" className="absolute top-3 right-3 h-9 w-9 rounded-full" onClick={closeLightbox}>
                <X className="h-4 w-4" />
              </Button>

              {/* Prev */}
              {media.length > 1 && (
                <Button variant="secondary" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full" onClick={prev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              {/* Next */}
              {media.length > 1 && (
                <Button variant="secondary" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full" onClick={next}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}

              {/* Footer com info do ficheiro */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <div className="flex items-center justify-between gap-3 text-white">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{media[lightboxIndex].fileName}</div>
                    <div className="text-[11px] text-white/70">
                      {formatSize(media[lightboxIndex].sizeBytes)} · {new Date(media[lightboxIndex].timestamp).toLocaleString(locale)}
                      {media[lightboxIndex].source && ` · ${media[lightboxIndex].source}`}
                      {media.length > 1 && ` · ${lightboxIndex + 1} ${t('media.lightbox.of')} ${media.length}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {media[lightboxIndex].flagged && (
                      <Badge variant="destructive" className="gap-1">
                        <Flag className="h-3 w-3" />
                        {media[lightboxIndex].flagReason ?? 'flag'}
                      </Badge>
                    )}
                    <a
                      href={`/api/dashboard/media/file?id=${media[lightboxIndex].id}`}
                      download={media[lightboxIndex].fileName}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Download className="h-4 w-4 text-white" />
                    </a>
                  </div>
                </div>
              </div>
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
