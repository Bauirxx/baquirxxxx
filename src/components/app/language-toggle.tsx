'use client'

import { useI18n } from '@/lib/i18n/context'
import { Button } from '@/components/ui/button'
import { Globe } from 'lucide-react'

export function LanguageToggle() {
  const { locale, setLocale } = useI18n()
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full border-border bg-background/80 backdrop-blur gap-2"
      onClick={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
    >
      <Globe className="h-3.5 w-3.5" />
      {locale === 'pt-BR' ? 'PT' : 'EN'}
    </Button>
  )
}
