'use client'

// GuardianLink — AppShell
// Máquina de estados: landing → auth → onboarding → dashboard
// A única rota visível é `/`, então toda a navegação acontece client-side.
import { useEffect, useState, useCallback } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Landing } from './landing/landing'
import { AuthModal } from './auth/auth-modal'
import { OnboardingWizard } from './onboarding/onboarding-wizard'
import { DashboardLayout } from './dashboard/dashboard-layout'
import { ThemeToggle } from './theme-toggle'
import { LanguageToggle } from './language-toggle'
import { toast } from 'sonner'
import type { AppShellView, DashboardView, Locale } from '@/lib/types'

interface AppUser {
  id: string
  email: string
  name: string
  jurisdiction: 'BR' | 'EU' | 'US'
  locale: Locale
  onboardingStep: number
}

export function AppShell() {
  const { t, locale, setLocale } = useI18n()
  const [view, setView] = useState<AppShellView>('landing')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  const [authOpen, setAuthOpen] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview')

  // Boot: checa sessão existente
  const refreshUser = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const u = data.user as AppUser
        setUser(u)
        // Se o idioma do backend divergir do front, atualiza front
        if (u.locale && u.locale !== locale) {
          setLocale(u.locale)
        }
        if (u.onboardingStep >= 5) {
          setView('dashboard')
        } else if (u.onboardingStep >= 1) {
          setView('onboarding')
        } else {
          setView('landing')
        }
      } else {
        setUser(null)
        setView('landing')
      }
    } catch {
      setUser(null)
      setView('landing')
    } finally {
      setLoading(false)
    }
  }, [locale, setLocale])

  useEffect(() => {
    refreshUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  const handleAuthSuccess = async (u: AppUser) => {
    setUser(u)
    setAuthOpen(false)
    if (u.locale && u.locale !== locale) setLocale(u.locale)
    if (u.onboardingStep >= 5) {
      setView('dashboard')
    } else if (u.onboardingStep >= 1) {
      setView('onboarding')
    } else {
      // Força passar pelo onboarding desde o step 1
      setView('onboarding')
    }
    toast.success(t('auth.success.welcome'))
  }

  const handleOnboardingComplete = async () => {
    await refreshUser()
    setView('dashboard')
    setDashboardView('overview')
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setView('landing')
    setDashboardView('overview')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="font-serif-display text-2xl text-foreground/70 animate-soft-pulse">
          GuardianLink
        </div>
        <div className="text-sm text-muted-foreground mt-2">{t('common.loading')}</div>
      </div>
    )
  }

  if (view === 'dashboard' && user) {
    return (
      <DashboardLayout
        user={user}
        currentView={dashboardView}
        onViewChange={setDashboardView}
        onLogout={handleLogout}
        onLocaleChange={setLocale}
      />
    )
  }

  if (view === 'onboarding' && user) {
    return (
      <>
        <OnboardingWizard user={user} onLocaleChange={setLocale} onComplete={handleOnboardingComplete} />
        <div className="fixed top-4 right-4 z-50 flex gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </>
    )
  }

  // Landing
  return (
    <>
      <Landing
        onSignup={() => handleOpenAuth('signup')}
        onSignin={() => handleOpenAuth('signin')}
      />
      <AuthModal
        open={authOpen}
        mode={authMode}
        onModeChange={setAuthMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </>
  )
}
