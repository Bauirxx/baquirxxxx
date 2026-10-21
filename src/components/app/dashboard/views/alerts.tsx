'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { toast } from 'sonner'
import { AlertTriangle, Check, ShieldAlert } from 'lucide-react'
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { SocialAlertDTO } from '@/lib/types'

interface AlertsViewProps {
  onAlertsChange: Dispatch<SetStateAction<number>>
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  medium: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  critical: 'bg-red-600 text-white',
}

export function AlertsView({ onAlertsChange }: AlertsViewProps) {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ events: SocialAlertDTO[] }>('/api/dashboard/alerts?limit=100', {
    refreshMs: 15000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    const hasAlert = rtEvents.some(e => e.type === 'alert')
    if (hasAlert) refresh()
  }, [rtEvents, refresh])

  useEffect(() => {
    if (data) onAlertsChange(data.events.filter(a => !a.resolved).length)
  }, [data, onAlertsChange])

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    )
  }

  const alerts = data?.events ?? []
  const unresolved = alerts.filter(a => !a.resolved)
  const resolved = alerts.filter(a => a.resolved)

  if (!alerts.length) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t('alerts.empty.title')}
        body={t('alerts.empty.body')}
      />
    )
  }

  async function resolve(alertId: string) {
    const res = await fetch('/api/dashboard/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
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
      {unresolved.length > 0 && (
        <div className="space-y-3">
          {unresolved.map(a => (
            <Card key={a.id} className="border-l-4 border-l-primary shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    <span className="font-medium capitalize">{a.platform}</span>
                    <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.medium}`}>
                      {t(`alerts.severity.${a.severity}`)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {new Date(a.timestamp).toLocaleString(locale)}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground italic border-l-2 border-border pl-3">
                  {a.snippet}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => resolve(a.id)} className="gap-1">
                    <Check className="h-3 w-3" />
                    {t('alerts.col.status')}
                  </Button>
                  {a.actionTaken && (
                    <Badge variant="secondary" className="text-[10px]">{a.actionTaken}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h3 className="font-serif-display text-lg mb-3 text-muted-foreground">
            {t('alerts.col.status')} ({resolved.length})
          </h3>
          <div className="space-y-2 opacity-60">
            {resolved.slice(0, 10).map(a => (
              <Card key={a.id} className="border-border/40 shadow-none">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-muted-foreground">
                      {new Date(a.timestamp).toLocaleString(locale)}
                    </div>
                    <div className="text-sm truncate">{a.snippet}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
