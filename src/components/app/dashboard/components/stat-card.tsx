'use client'

import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'info'
  hint?: string
  /** Variação percentual vs. período anterior. Positivo = verde, negativo = vermelho. */
  trend?: number
  /** Rótulo do período de comparação (ex: "vs. ontem"). */
  trendLabel?: string
}

const TONE_CLASSES: Record<string, string> = {
  default: 'bg-muted text-foreground',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
}

export function StatCard({ label, value, icon: Icon, tone = 'default', hint, trend, trendLabel }: StatCardProps) {
  const hasTrend = typeof trend === 'number'
  const TrendIcon = hasTrend ? (trend! > 0 ? TrendingUp : trend! < 0 ? TrendingDown : Minus) : null
  const trendColor = hasTrend
    ? trend! > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend! < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
    : ''

  return (
    <Card className="border-border/60 shadow-card bg-surface-gradient overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </div>
          {Icon && (
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', TONE_CLASSES[tone])}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-2.5 font-serif-display text-[1.75rem] leading-none text-foreground tracking-tight">
          {value}
        </div>
        <div className="mt-2 flex items-center gap-2 min-h-[1rem]">
          {hasTrend && TrendIcon && (
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {trend === 0 ? '0%' : `${trend! > 0 ? '+' : ''}${trend}%`}
            </span>
          )}
          {(hint || trendLabel) && (
            <span className="text-[11px] text-muted-foreground truncate">
              {hasTrend ? trendLabel : hint}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
