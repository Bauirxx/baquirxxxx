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
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react'
import { useEffect } from 'react'
import type { CallEventDTO } from '@/lib/types'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function CallsView() {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ events: CallEventDTO[] }>('/api/dashboard/calls?limit=100', {
    refreshMs: 30000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    const hasCall = rtEvents.some(e => e.type === 'call')
    if (hasCall) refresh()
  }, [rtEvents, refresh])

  const calls = data?.events ?? []

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  if (!calls.length) {
    return (
      <EmptyState
        icon={Phone}
        title={t('calls.empty.title')}
        body={t('calls.empty.body')}
      />
    )
  }

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-32">{t('calls.col.time')}</TableHead>
              <TableHead>{t('calls.col.number')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('calls.col.contact')}</TableHead>
              <TableHead className="w-32">{t('calls.col.direction')}</TableHead>
              <TableHead className="w-24 text-right">{t('calls.col.duration')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map(c => {
              const Icon = c.direction === 'incoming' ? PhoneIncoming : c.direction === 'outgoing' ? PhoneOutgoing : PhoneMissed
              const dirColor = c.direction === 'missed' ? 'text-destructive' : c.direction === 'incoming' ? 'text-green-600 dark:text-green-400' : 'text-foreground/70'
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {new Date(c.timestamp).toLocaleString(locale)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{c.phoneNumber}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {c.contactName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className={`inline-flex items-center gap-1.5 text-xs ${dirColor}`}>
                      <Icon className="h-3 w-3" />
                      {t(`calls.direction.${c.direction}`)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.direction === 'missed' ? '—' : formatDuration(c.duration)}
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
