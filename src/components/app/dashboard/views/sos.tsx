'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { toast } from 'sonner'
import { Siren, Check } from 'lucide-react'
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { SosEventDTO } from '@/lib/types'

interface SosViewProps {
  onSosChange: Dispatch<SetStateAction<number>>
}

export function SosView({ onSosChange }: SosViewProps) {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ events: SosEventDTO[] }>('/api/dashboard/sos', {
    refreshMs: 15000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    const hasSos = rtEvents.some(e => e.type === 'sos')
    if (hasSos) refresh()
  }, [rtEvents, refresh])

  useEffect(() => {
    if (data) onSosChange(data.events.filter(e => !e.resolved).length)
  }, [data, onSosChange])

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    )
  }

  const events = data?.events ?? []
  const active = events.filter(e => !e.resolved)
  const resolved = events.filter(e => e.resolved)

  if (!events.length) {
    return (
      <EmptyState
        icon={Siren}
        title={t('sos.empty.title')}
        body={t('sos.empty.body')}
      />
    )
  }

  async function resolve(sosId: string) {
    const res = await fetch('/api/dashboard/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sosId }),
    })
    if (res.ok) {
      toast.success(t('toast.sos.resolved'))
      refresh()
    } else {
      toast.error(t('toast.error'))
    }
  }

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div>
          <h3 className="font-serif-display text-lg mb-3 text-destructive flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-soft-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            {t('sos.active')}
          </h3>
          <div className="space-y-3">
            {active.map(s => (
              <Card key={s.id} className="border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/10 shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Siren className="h-5 w-5 text-red-600" />
                      <div>
                        <div className="font-medium">
                          {t('sos.col.trigger')}: <span className="font-mono">{s.trigger}</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {new Date(s.timestamp).toLocaleString(locale)}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="default" onClick={() => resolve(s.id)} className="gap-1">
                      <Check className="h-3 w-3" />
                      {t('sos.resolve')}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {s.latitude != null && s.longitude != null && (
                      <div className="rounded border border-border/40 bg-background/60 px-2 py-1.5">
                        <div className="text-[10px] uppercase text-muted-foreground">GPS</div>
                        <div className="font-mono">{s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}</div>
                      </div>
                    )}
                    {s.battery != null && (
                      <div className="rounded border border-border/40 bg-background/60 px-2 py-1.5">
                        <div className="text-[10px] uppercase text-muted-foreground">{t('location.battery')}</div>
                        <div className="font-mono">{s.battery}%</div>
                      </div>
                    )}
                    {s.accuracy != null && (
                      <div className="rounded border border-border/40 bg-background/60 px-2 py-1.5">
                        <div className="text-[10px] uppercase text-muted-foreground">{t('location.accuracy')}</div>
                        <div className="font-mono">{s.accuracy.toFixed(0)} m</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h3 className="font-serif-display text-lg mb-3 text-muted-foreground">{t('sos.history')}</h3>
          <div className="space-y-2 opacity-60">
            {resolved.slice(0, 20).map(s => (
              <Card key={s.id} className="border-border/40 shadow-none">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {new Date(s.timestamp).toLocaleString(locale)}
                    </div>
                    <div className="text-sm">Trigger: {s.trigger}</div>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Check className="h-3 w-3" />
                    {t('sos.resolve')}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
