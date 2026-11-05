'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import {
  BarChart3,
  Activity,
  Target,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { StatCard } from '../components/stat-card'
import type { SyncMetricsDTO } from '@/lib/types'

export function MetricsView() {
  const { t, locale } = useI18n()
  const { data, loading } = useFetch<SyncMetricsDTO>('/api/dashboard/metrics', { refreshMs: 15000 })

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) return null

  const hasData = data.commands24h > 0

  if (!hasData) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t('metrics.empty.title')}
        body={t('metrics.empty.body')}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label={t('metrics.stat.commands')}
          value={data.commands24h}
          icon={Activity}
          tone="primary"
        />
        <StatCard
          label={t('metrics.stat.precision')}
          value={`${(data.precision * 100).toFixed(1)}%`}
          icon={Target}
          tone={data.precision > 0.9 ? 'primary' : 'warning'}
        />
        <StatCard
          label={t('metrics.stat.avgDeviation')}
          value={`${data.avgDeviation.toFixed(0)}`}
          icon={TrendingUp}
        />
        <StatCard
          label={t('metrics.stat.maxDeviation')}
          value={`${data.maxDeviation.toFixed(0)}`}
          icon={Clock}
          tone={data.maxDeviation > 100 ? 'warning' : 'default'}
        />
        <StatCard
          label={t('metrics.stat.failures')}
          value={data.failures24h}
          icon={XCircle}
          tone={data.failures24h > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label={t('metrics.stat.timeouts')}
          value={data.timeouts24h}
          icon={AlertCircle}
          tone={data.timeouts24h > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif-display text-sm">{t('metrics.chart.commands')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.commandsPerHour} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis
                    dataKey="hour"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tick={{ fill: 'var(--muted-foreground)' }}
                    interval={3}
                  />
                  <YAxis stroke="var(--muted-foreground)" fontSize={10} allowDecimals={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    name={t('metrics.chart.commands')}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif-display text-sm">{t('metrics.chart.deviation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {data.deviationByDevice.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.deviationByDevice} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} />
                    <YAxis
                      type="category"
                      dataKey="deviceName"
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      width={80}
                      tick={{ fill: 'var(--muted-foreground)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="deviation"
                      fill="var(--primary)"
                      radius={[0, 4, 4, 0]}
                      name="ms"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  {t('metrics.empty.body')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event history */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif-display text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('metrics.history.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2">{t('metrics.col.time')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2">{t('metrics.col.command')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2">{t('metrics.col.mode')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2">{t('metrics.col.success')}</th>
                  <th className="text-right font-medium text-muted-foreground px-3 py-2">{t('metrics.col.avgDev')}</th>
                  <th className="text-right font-medium text-muted-foreground px-3 py-2">{t('metrics.col.maxDev')}</th>
                  <th className="text-right font-medium text-muted-foreground px-3 py-2">{t('metrics.col.targets')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map(e => (
                  <tr key={e.id} className="border-t border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {new Date(e.timestamp).toLocaleString(locale)}
                    </td>
                    <td className="px-3 py-2 font-mono">{e.commandType}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {t(`sync.mode.${e.mode}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                        {e.successCount}
                        {e.failCount > 0 && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                            <XCircle className="h-3 w-3" />
                            {e.failCount}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{e.avgDeviation.toFixed(0)}ms</td>
                    <td className="px-3 py-2 text-right font-mono">{e.maxDeviation.toFixed(0)}ms</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {e.targets?.length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
