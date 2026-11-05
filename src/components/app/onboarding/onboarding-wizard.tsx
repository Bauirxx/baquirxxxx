'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import {
  Scale,
  ShieldCheck,
  User,
  Smartphone,
  Loader2,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { JURISDICTIONS, LEGAL_SNIPPETS, legalVersionFor } from '@/lib/constants'
import type { Jurisdiction, Locale } from '@/lib/types'

interface OnboardingWizardProps {
  user: {
    id: string
    email: string
    name: string
    jurisdiction: Jurisdiction
    locale: Locale
    onboardingStep: number
  }
  onLocaleChange: (l: Locale) => void
  onComplete: () => void
}

const STEPS = ['jurisdiction', 'consent', 'child', 'device', 'finish'] as const
type Step = typeof STEPS[number]

export function OnboardingWizard({ user, onLocaleChange: _onLocaleChange, onComplete }: OnboardingWizardProps) {
  const { t, locale } = useI18n()
  // Passo inicial baseado no onboardingStep do user
  const initialStepIdx = Math.max(0, Math.min(STEPS.length - 1, user.onboardingStep - 1))
  const [stepIdx, setStepIdx] = useState(initialStepIdx)
  const step = STEPS[stepIdx]

  // Estado local
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(user.jurisdiction ?? 'BR')
  const [consent, setConsent] = useState({ parent: false, inform: false, terms: false })
  const [childName, setChildName] = useState('')
  const [childBirthDate, setChildBirthDate] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [installCode, setInstallCode] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Pré-carrega estado do onboarding se o user já avançou
  useEffect(() => {
    async function loadState() {
      const res = await fetch('/api/onboarding/step', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data.jurisdiction) setJurisdiction(data.jurisdiction)
        if (data.child) {
          setChildName(data.child.name)
          const d = new Date(data.child.birthDate)
          setChildBirthDate(d.toISOString().slice(0, 10))
        }
        if (data.device) {
          setInstallCode(data.device.installCode)
          setDeviceId(data.device.id)
          setDeviceName(data.device.name)
        }
      }
    }
    loadState()
  }, [])

  function copyCode() {
    if (!installCode) return
    navigator.clipboard.writeText(installCode)
    setCopied(true)
    toast.success(t('toast.copied'))
    setTimeout(() => setCopied(false), 1800)
  }

  async function next() {
    setLoading(true)
    try {
      if (step === 'jurisdiction') {
        const res = await fetch('/api/onboarding/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'jurisdiction', jurisdiction }),
        })
        if (!res.ok) {
          toast.error(t('toast.error'))
          return
        }
        setStepIdx(1)
      } else if (step === 'consent') {
        if (!consent.parent || !consent.inform || !consent.terms) {
          toast.error(t('onboarding.consent.warning'))
          return
        }
        const res = await fetch('/api/onboarding/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'consent', consent }),
        })
        if (!res.ok) {
          toast.error(t('toast.error'))
          return
        }
        toast.success(t('toast.consent.recorded'))
        setStepIdx(2)
      } else if (step === 'child') {
        if (!childName || !childBirthDate) {
          toast.error(t('toast.error'))
          return
        }
        const res = await fetch('/api/onboarding/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'child', child: { name: childName, birthDate: childBirthDate } }),
        })
        if (!res.ok) {
          toast.error(t('toast.error'))
          return
        }
        setStepIdx(3)
      } else if (step === 'device') {
        if (!deviceName) {
          toast.error(t('toast.error'))
          return
        }
        const res = await fetch('/api/onboarding/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'device', device: { name: deviceName } }),
        })
        if (!res.ok) {
          toast.error(t('toast.error'))
          return
        }
        const data = await res.json()
        setInstallCode(data.device.installCode)
        setDeviceId(data.device.id)
        setStepIdx(4)
      } else if (step === 'finish') {
        await fetch('/api/onboarding/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'finish' }),
        })
        onComplete()
      }
    } finally {
      setLoading(false)
    }
  }

  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }

  const currentJurisdictionMeta = JURISDICTIONS.find(j => j.code === jurisdiction)!
  const legalVersion = legalVersionFor(jurisdiction)
  const legalSnippet = LEGAL_SNIPPETS[jurisdiction][locale]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/85 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-serif-display text-xl">{t('brand.name')}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {t('onboarding.step.jurisdiction')} {stepIdx + 1}/{STEPS.length}
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-border/40">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 sm:py-12 max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-serif-display text-3xl sm:text-4xl text-foreground">{t('onboarding.title')}</h1>
          <p className="mt-2 text-muted-foreground">{t('onboarding.subtitle')}</p>
        </div>

        {/* Step indicator chips */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          {STEPS.map((s, i) => {
            const Icon = i === 0 ? Scale : i === 1 ? ShieldCheck : i === 2 ? User : i === 3 ? Smartphone : Check
            return (
              <div
                key={s}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  i === stepIdx
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : i < stepIdx
                    ? 'border-border bg-muted text-muted-foreground'
                    : 'border-border text-muted-foreground/60'
                }`}
              >
                {i < stepIdx ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                {t(`onboarding.step.${s}`)}
              </div>
            )
          })}
        </div>

        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="font-serif-display text-2xl">
              {step === 'jurisdiction' && t('onboarding.jurisdiction.title')}
              {step === 'consent' && t('onboarding.consent.title')}
              {step === 'child' && t('onboarding.child.title')}
              {step === 'device' && t('onboarding.device.title')}
              {step === 'finish' && t('onboarding.finish.title')}
            </CardTitle>
            <CardDescription>
              {step === 'jurisdiction' && t('onboarding.jurisdiction.subtitle')}
              {step === 'consent' && t('onboarding.consent.subtitle')}
              {step === 'child' && t('onboarding.child.subtitle')}
              {step === 'device' && t('onboarding.device.subtitle')}
              {step === 'finish' && t('onboarding.finish.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Jurisdiction */}
            {step === 'jurisdiction' && (
              <div className="space-y-3">
                {JURISDICTIONS.map(j => (
                  <label
                    key={j.code}
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      jurisdiction === j.code
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border hover:border-border/80 hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jurisdiction"
                      checked={jurisdiction === j.code}
                      onChange={() => setJurisdiction(j.code)}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{j.label[locale]}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{j.law[locale]}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {locale === 'pt-BR' ? 'Idade de consentimento' : 'Age of consent'}: {j.ageOfConsent} · {' '}
                        {j.rightToBeForgotten ? (locale === 'pt-BR' ? 'Esquecimento: sim' : 'Erasure: yes') : (locale === 'pt-BR' ? 'Esquecimento: não' : 'Erasure: no')}
                        {j.requiresDPIA ? ` · DPIA: ${locale === 'pt-BR' ? 'obrigatória' : 'required'}` : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Consent */}
            {step === 'consent' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <Scale className="h-4 w-4 text-primary mt-0.5" />
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {currentJurisdictionMeta.label[locale]} · {legalVersion}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{legalSnippet}</p>
                </div>
                <div className="space-y-3">
                  {[
                    { key: 'parent' as const, label: t('onboarding.consent.checkbox.parent') },
                    { key: 'inform' as const, label: t('onboarding.consent.checkbox.inform') },
                    { key: 'terms' as const, label: t('onboarding.consent.checkbox.terms') },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={consent[key]}
                        onCheckedChange={(v) => setConsent({ ...consent, [key]: v === true })}
                        className="mt-1"
                      />
                      <span className="text-sm text-foreground leading-relaxed">{label}</span>
                    </label>
                  ))}
                </div>
                <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                    {t('onboarding.consent.warning')}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Child */}
            {step === 'child' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="childName">{t('onboarding.child.name')}</Label>
                  <Input
                    id="childName"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder={t('onboarding.child.placeholder.name')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="childBirthDate">{t('onboarding.child.birthdate')}</Label>
                  <Input
                    id="childBirthDate"
                    type="date"
                    value={childBirthDate}
                    onChange={(e) => setChildBirthDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Device */}
            {step === 'device' && (
              <div className="space-y-4">
                {!installCode ? (
                  <div className="space-y-2">
                    <Label htmlFor="deviceName">{t('onboarding.device.name')}</Label>
                    <Input
                      id="deviceName"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder={t('onboarding.device.placeholder')}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        {t('onboarding.device.code.title')}
                      </div>
                      <div className="text-4xl font-mono font-bold text-primary tracking-[0.3em] mb-3">
                        {installCode}
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
                        {t('onboarding.device.code.subtitle')}
                      </p>
                      <Button size="sm" variant="outline" onClick={copyCode} className="gap-2">
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? t('onboarding.device.code.copied') : t('onboarding.device.code.copy')}
                      </Button>
                    </div>
                    <Alert className="border-border bg-muted/30">
                      <AlertDescription className="text-xs">
                        <strong className="text-foreground">{t('onboarding.device.waiting.title')}</strong> — {' '}
                        {t('onboarding.device.waiting.subtitle')} {t('onboarding.device.waiting.hint')}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            )}

            {/* Finish */}
            {step === 'finish' && (
              <div className="space-y-4 text-center py-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Check className="h-7 w-7" />
                </div>
                <h3 className="font-serif-display text-xl">{t('onboarding.finish.title')}</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">{t('onboarding.finish.subtitle')}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-border/40">
              <Button variant="ghost" size="sm" onClick={back} disabled={stepIdx === 0 || loading}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('common.back')}
              </Button>
              <Button size="sm" onClick={next} disabled={loading} className="gap-1">
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {step === 'finish' ? t('onboarding.finish.cta') : t('common.continue')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-border/60 mt-auto py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {t('brand.name')}
      </footer>
    </div>
  )
}
