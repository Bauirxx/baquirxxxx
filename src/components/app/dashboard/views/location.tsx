'use client'

import { useI18n } from '@/lib/i18n/context'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { MapView } from '../components/map-view'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { MapPin } from 'lucide-react'
import { useEffect } from 'react'
import type { LocationEventDTO } from '@/lib/types'

export function LocationView() {
  const { t } = useI18n()
  const { data, loading, refresh } = useFetch<{ events: LocationEventDTO[] }>('/api/dashboard/location?limit=500', {
    refreshMs: 15000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    const hasLoc = rtEvents.some(e => e.type === 'location')
    if (hasLoc) refresh()
  }, [rtEvents, refresh])

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const events = data?.events ?? []

  if (!events.length) {
    return (
      <EmptyState
        icon={MapPin}
        title={t('location.empty.title')}
        body={t('location.empty.body')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <MapView events={events} height={420} />
      <div className="text-xs text-muted-foreground">
        {t('location.history')} · {events.length} {events.length === 1 ? 'ponto' : 'pontos'}
      </div>
    </div>
  )
}
