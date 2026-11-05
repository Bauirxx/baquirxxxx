'use client'

import { useI18n } from '@/lib/i18n/context'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  body: string
  cta?: { label: string; onClick: () => void }
  hint?: string
}

export function EmptyState({ icon: Icon, title, body, cta, hint }: EmptyStateProps) {
  const { t: _t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="h-14 w-14 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mb-4">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-serif-display text-xl text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{body}</p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 text-sm text-primary hover:underline underline-offset-4"
        >
          {cta.label} →
        </button>
      )}
      {hint && (
        <div className="mt-6 text-xs text-muted-foreground/70 bg-muted/40 border border-border/40 rounded-md px-3 py-2 max-w-md">
          {hint}
        </div>
      )}
    </div>
  )
}
