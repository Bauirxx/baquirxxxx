'use client'

import { useI18n } from '@/lib/i18n/context'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  actions?: React.ReactNode
  /** Tom do ícone no selo. */
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'info'
}

const TONE_CLASSES: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
}

/**
 * Cabeçalho de página consistente em todo o dashboard.
 * Selo com ícone + título serif + subtítulo, com slot de ações à direita
 * (filtros, botões, seletor de dispositivo contextual).
 */
export function PageHeader({ icon: Icon, title, subtitle, actions, tone = 'primary' }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3.5 min-w-0">
        <div
          className={cn(
            'h-11 w-11 shrink-0 rounded-xl flex items-center justify-center shadow-soft',
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="font-serif-display text-2xl sm:text-[1.7rem] leading-tight text-foreground tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  )
}
