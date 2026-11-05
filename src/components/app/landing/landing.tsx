'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  ShieldCheck,
  Scale,
  Eye,
  Trash2,
  MapPin,
  Phone,
  MessageSquare,
  Clock,
  Globe2,
  Bell,
  AlertTriangle,
  ArrowRight,
  Usb,
  Wifi,
  MonitorPlay,
  Keyboard,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'

interface LandingProps {
  onSignup: () => void
  onSignin: () => void
}

export function Landing({ onSignup, onSignin }: LandingProps) {
  const { t, locale } = useI18n()
  const [legalAccepted, setLegalAccepted] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-serif-display text-xl">{t('brand.name')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onSignin} className="hidden sm:inline-flex">
              {t('landing.hero.cta.login')}
            </Button>
            <Button size="sm" onClick={onSignup} className="gap-1">
              {t('landing.hero.cta.signup')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="container mx-auto px-4 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6">
              <Scale className="h-3.5 w-3.5" />
              {t('landing.hero.eyebrow')}
            </div>
            <h1 className="font-serif-display text-4xl sm:text-5xl md:text-6xl text-foreground leading-[1.05] tracking-tight">
              {t('landing.hero.title')}
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" onClick={onSignup} className="gap-2 w-full sm:w-auto">
                {t('landing.hero.cta.signup')}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={onSignin} className="w-full sm:w-auto">
                {t('landing.hero.cta.login')}
              </Button>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="container mx-auto px-4 pb-16">
          <div className="text-center mb-10">
            <h2 className="font-serif-display text-2xl sm:text-3xl text-foreground">{t('landing.trust.title')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: ShieldCheck, key: '1' },
              { icon: Scale, key: '2' },
              { icon: Eye, key: '3' },
              { icon: Trash2, key: '4' },
            ].map(({ icon: Icon, key }) => (
              <Card key={key} className="p-6 border-border/60 shadow-none">
                <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif-display text-lg text-foreground mb-2">
                  {t(`landing.trust.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.trust.${key}.desc`)}
                </p>
              </Card>
            ))}
          </div>
        </section>

        {/* ScreenPorter — Remote control section */}
        <section className="container mx-auto px-4 py-16 border-t border-border/60">
          <div className="text-center mb-12">
            <h2 className="font-serif-display text-2xl sm:text-3xl text-foreground">{t('landing.section.control.title')}</h2>
            <p className="mt-2 text-muted-foreground">{t('landing.section.control.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Usb, key: '4ways' },
              { icon: MonitorPlay, key: 'mirror' },
              { icon: Keyboard, key: 'input' },
              { icon: RefreshCw, key: 'sync' },
            ].map(({ icon: Icon, key }) => (
              <Card key={key} className="p-6 border-border/60 shadow-none hover:border-primary/40 transition-colors">
                <div className="h-10 w-10 rounded-md bg-foreground/5 text-foreground flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif-display text-lg text-foreground mb-2">
                  {t(`landing.control.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.control.${key}.desc`)}
                </p>
              </Card>
            ))}
          </div>
        </section>

        {/* Two pillars */}
        <section className="container mx-auto px-4 py-16 border-t border-border/60">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-serif-display text-2xl sm:text-3xl text-foreground mb-3">{t('landing.section.both.title')}</h2>
            <p className="text-muted-foreground">{t('landing.section.both.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <Card className="p-6 border-primary/30 bg-primary/5 shadow-none">
              <MonitorPlay className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-serif-display text-xl mb-2">{t('landing.section.control.title')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('landing.section.control.subtitle')}
              </p>
            </Card>
            <Card className="p-6 border-primary/30 bg-primary/5 shadow-none">
              <ShieldCheck className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-serif-display text-xl mb-2">{t('landing.section.monitor.title')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('landing.section.monitor.subtitle')}
              </p>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16 border-t border-border/60">
          <div className="text-center mb-12">
            <h2 className="font-serif-display text-2xl sm:text-3xl text-foreground">{t('landing.features.title')}</h2>
            <p className="mt-2 text-muted-foreground">{t('landing.features.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: MapPin, key: 'location' },
              { icon: Phone, key: 'calls' },
              { icon: MessageSquare, key: 'sms' },
              { icon: Clock, key: 'apps' },
              { icon: Globe2, key: 'browser' },
              { icon: AlertTriangle, key: 'alerts' },
            ].map(({ icon: Icon, key }) => (
              <Card key={key} className="p-6 border-border/60 shadow-none hover:border-primary/40 transition-colors">
                <div className="h-10 w-10 rounded-md bg-foreground/5 text-foreground flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif-display text-lg text-foreground mb-2">
                  {t(`landing.feature.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.feature.${key}.desc`)}
                </p>
              </Card>
            ))}
            <Card className="p-6 border-primary/40 bg-primary/5 shadow-none">
              <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center mb-4">
                <Bell className="h-5 w-5" />
              </div>
              <h3 className="font-serif-display text-lg text-foreground mb-2">
                {t('landing.feature.sos.title')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('landing.feature.sos.desc')}
              </p>
            </Card>
          </div>
        </section>

        {/* Legal banner */}
        <section className="container mx-auto px-4 py-12">
          <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="font-serif-display">{t('landing.legal.banner.title')}</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              {t('landing.legal.banner.body')}
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  onClick={() => setLegalAccepted(true)}
                >
                  {t('landing.legal.banner.cta')}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </section>

        {/* Final CTA */}
        <section className="container mx-auto px-4 py-16 sm:py-20">
          <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-8 sm:p-12 text-center">
            <h2 className="font-serif-display text-2xl sm:text-3xl text-foreground mb-3">
              {t('landing.hero.cta.signup')}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t('auth.signup.subtitle')}</p>
            <Button size="lg" onClick={onSignup} className="gap-2">
              {t('landing.hero.cta.signup')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-foreground/[0.02] mt-auto">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-serif-display text-lg">{t('brand.name')}</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              {t('landing.footer.built')} {locale === 'pt-BR' ? 'LGPD · GDPR · COPPA' : 'LGPD · GDPR · COPPA'}.
            </p>
            <p className="text-xs text-muted-foreground/80 max-w-md">
              {t('landing.footer.disclaimer')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
