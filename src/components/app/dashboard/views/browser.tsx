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
import { Globe, ShieldX, Check } from 'lucide-react'
import { useEffect } from 'react'
import type { BrowserEventDTO } from '@/lib/types'

const CATEGORY_COLORS: Record<string, string> = {
  social: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  news: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  adult: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  games: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  education: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  shopping: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  other: 'bg-muted text-muted-foreground',
}

export function BrowserView() {
  const { t, locale } = useI18n()
  const { data, loading, refresh } = useFetch<{ events: BrowserEventDTO[] }>('/api/dashboard/browser?limit=100', {
    refreshMs: 30000,
  })
  const { events: rtEvents } = useRealtime()

  useEffect(() => {
    const hasBrowser = rtEvents.some(e => e.type === 'browser')
    if (hasBrowser) refresh()
  }, [rtEvents, refresh])

  const events = data?.events ?? []

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  if (!events.length) {
    return (
      <EmptyState
        icon={Globe}
        title={t('browser.empty.title')}
        body={t('browser.empty.body')}
      />
    )
  }

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-32">{t('browser.col.time')}</TableHead>
              <TableHead>{t('browser.col.url')}</TableHead>
              <TableHead className="w-28 hidden sm:table-cell">{t('browser.col.category')}</TableHead>
              <TableHead className="w-24 text-right">{t('browser.col.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map(b => (
              <TableRow key={b.id}>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {new Date(b.timestamp).toLocaleString(locale)}
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="text-sm truncate">{b.url}</div>
                  {b.title && <div className="text-xs text-muted-foreground truncate">{b.title}</div>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {b.category && (
                    <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.other}`}>
                      {b.category}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {b.blocked ? (
                    <Badge variant="destructive" className="gap-1">
                      <ShieldX className="h-3 w-3" />
                      {t('browser.blocked')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" />
                      {t('browser.allowed')}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
