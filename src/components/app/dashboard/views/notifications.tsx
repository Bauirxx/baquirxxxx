'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { useEffect } from 'react'
import {
  MessageCircle,
  Instagram,
  Music2,
  Ghost,
  Send,
  AlertTriangle,
  Filter,
} from 'lucide-react'

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
  whatsapp: 'text-green-600',
  instagram: 'text-pink-600',
  tiktok: 'text-black dark:text-white',
  snapchat: 'text-yellow-500',
  messenger: 'text-blue-600',
  telegram: 'text-blue-500',
  discord: 'text-indigo-600',
  facebook: 'text-blue-700',
  sms: 'text-gray-600',
  other: 'text-gray-500',
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  medium: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  critical: 'bg-red-600 text-white',
}

interface NotificationDTO {
  id: string
  deviceId: string
  platform: string
  packageName: string
  title: string
  text: string
  flagged: boolean
  flagReason: string | null
  severity: string | null
  timestamp: string
}

export function NotificationsView() {
  const { t, locale } = useI18n()
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

  const { data, loading, refresh } = useFetch<{ events: NotificationDTO[] }>(
    `/api/dashboard/notifications?limit=200${flaggedOnly ? '&flagged=true' : ''}${selectedPlatform ? `&platform=${selectedPlatform}` : ''}`,
    { refreshMs: 15000, deps: [flaggedOnly, selectedPlatform] }
  )
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    if (rtEvents.some(e => e.type === 'notification' || e.type === 'alert')) refresh()
  }, [rtEvents, refresh])

  const events = data?.events ?? []

  // Unique platforms for filter
  const platforms = Array.from(new Set(events.map(e => e.platform)))

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Sem notificações capturadas"
        body="As notificações de WhatsApp, Instagram, TikTok, etc. aparecem aqui quando a app Companion estiver ativa com permissão de Notification Listener."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={flaggedOnly ? 'default' : 'outline'}
          onClick={() => setFlaggedOnly(!flaggedOnly)}
          className="gap-1.5"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {flaggedOnly ? 'Sinalizadas' : 'Todas'}
        </Button>
        {platforms.map(p => (
          <Button
            key={p}
            size="sm"
            variant={selectedPlatform === p ? 'default' : 'outline'}
            onClick={() => setSelectedPlatform(selectedPlatform === p ? null : p)}
            className="capitalize"
          >
            {p}
          </Button>
        ))}
      </div>

      {/* Lista de notificações */}
      <div className="space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
        {events.map(e => {
          const Icon = PLATFORM_ICONS[e.platform] ?? MessageCircle
          const colorClass = PLATFORM_COLORS[e.platform] ?? 'text-gray-500'
          return (
            <Card
              key={e.id}
              className={`border-border/60 shadow-none ${e.flagged ? 'border-l-4 border-l-red-500' : ''}`}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium capitalize">{e.platform}</span>
                      {e.flagged && (
                        <Badge
                          className={`text-[10px] ${SEVERITY_COLORS[e.severity ?? 'medium'] ?? SEVERITY_COLORS.medium}`}
                        >
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          {e.flagReason ?? 'flagged'}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                        {new Date(e.timestamp).toLocaleString(locale)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-foreground truncate">
                      {e.title || '(sem título)'}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 break-words">
                      {e.text}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
