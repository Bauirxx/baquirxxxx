'use client'

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
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useRealtime } from '../realtime-provider'
import { MessageSquare, ArrowDownLeft, ArrowUpRight, AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import type { SmsEventDTO } from '@/lib/types'

export function SmsView() {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ events: SmsEventDTO[] }>('/api/dashboard/sms?limit=100', {
    refreshMs: 30000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    const hasSms = rtEvents.some(e => e.type === 'sms')
    if (hasSms) refresh()
  }, [rtEvents, refresh])

  const messages = data?.events ?? []

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  if (!messages.length) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={t('sms.empty.title')}
        body={t('sms.empty.body')}
      />
    )
  }

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-32">{t('sms.col.time')}</TableHead>
              <TableHead className="w-24">{t('sms.col.direction')}</TableHead>
              <TableHead>{t('sms.col.number')}</TableHead>
              <TableHead>{t('sms.col.body')}</TableHead>
              <TableHead className="w-24 text-right">{t('sms.col.flag')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map(s => {
              const Icon = s.direction === 'incoming' ? ArrowDownLeft : ArrowUpRight
              return (
                <TableRow key={s.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {new Date(s.timestamp).toLocaleString(locale)}
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <Icon className="h-3 w-3" />
                      {t(`sms.direction.${s.direction}`)}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{s.phoneNumber}</TableCell>
                  <TableCell className="text-sm max-w-md truncate">
                    {s.body}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.flagged ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('sms.flagged')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {s.flagReason && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{s.flagReason}</div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
