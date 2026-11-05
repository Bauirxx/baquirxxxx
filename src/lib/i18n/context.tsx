'use client'

// GuardianLink — Provider de idioma (PT-BR + EN)
// Lê de cookie server-rendered, persiste em localStorage, atualiza cookie via API
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DICTS } from './translations'
import type { Locale } from '../types'

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const LOCALE_COOKIE = 'gl_locale'
const LOCALE_STORAGE = 'gl_locale'

function detectInitialLocale(cookieLocale?: string): Locale {
  // IMPORTANTE: tem de devolver o MESMO valor no servidor e no cliente durante o
  // primeiro render, senão dá hydration mismatch ("Carregando…" vs "Loading…").
  // A deteção por navigator.language é feita depois, no useEffect de montagem.
  if (cookieLocale === 'pt-BR' || cookieLocale === 'en') return cookieLocale
  return 'pt-BR'
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode
  initialLocale?: string
}) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale(initialLocale))

  // Persiste mudança de idioma
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE, l)
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      // Atualiza o atributo lang do <html>
      document.documentElement.lang = l === 'pt-BR' ? 'pt-BR' : 'en'
    }
  }, [])

  // Após montar (cliente): aplica a preferência guardada ou, na 1ª visita sem cookie,
  // deteta o idioma do browser. Feito aqui (e não no 1º render) para evitar mismatch.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(LOCALE_STORAGE) as Locale | null
    let next: Locale | null = null
    if (stored === 'pt-BR' || stored === 'en') {
      next = stored
    } else if (!initialLocale && typeof navigator !== 'undefined' && navigator.language) {
      next = navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
    }
    if (next && next !== locale) {
      // Preferência só conhecida no cliente → aplicada após montar (evita hydration mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(next)
    }
  }, [])

  // Aplica lang no <html>
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'pt-BR' ? 'pt-BR' : 'en'
    }
  }, [locale])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] ?? DICTS['pt-BR']
      let value = dict[key] ?? DICTS['pt-BR'][key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replace(`{${k}}`, String(v))
        }
      }
      return value
    },
    [locale]
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
