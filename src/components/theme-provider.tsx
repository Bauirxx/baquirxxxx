'use client'

// GuardianLink — Theme provider (light/dark) sem next-themes.
// Evita o erro do React 19 / Next 16 ("Encountered a script tag while rendering
// React component") porque NÃO injeta nenhum <script> inline: o tema inicial vem
// do servidor (cookie `gl_theme`, aplicado como classe no <html> em layout.tsx) e
// depois é controlado aqui via classe. Mantém a API useTheme() { theme, setTheme }.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export const THEME_COOKIE = 'gl_theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  root.style.colorScheme = theme
}

export function ThemeProvider({
  children,
  initialTheme = 'light',
}: {
  children: ReactNode
  initialTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* cookies indisponíveis — ignora */
    }
    try {
      localStorage.setItem(THEME_COOKIE, next)
    } catch {
      /* localStorage indisponível — ignora */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  // Garante que o <html> reflete o estado inicial (classe já vem do servidor).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Fora do provider (ex.: SSR de componentes isolados): devolve um fallback seguro.
    return { theme: 'light', setTheme: () => {}, toggleTheme: () => {} }
  }
  return ctx
}
