'use client'

import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  tone?: 'default' | 'primary' | 'warning' | 'danger'
  hint?: string
}

export function StatCard({ label, value, icon: Icon, tone = 'default', hint }: StatCardProps) {
  const toneClasses = {
    default: 'bg-muted/40 text-foreground',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  }[tone]
  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          {Icon && (
            <div className={`h-8 w-8 rounded-md flex items-center justify-center ${toneClasses}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-2 font-serif-display text-2xl text-foreground">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}
