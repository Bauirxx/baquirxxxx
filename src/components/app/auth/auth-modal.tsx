'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import type { Locale } from '@/lib/types'

interface AuthModalProps {
  open: boolean
  mode: 'signin' | 'signup'
  onModeChange: (mode: 'signin' | 'signup') => void
  onClose: () => void
  onSuccess: (user: {
    id: string
    email: string
    name: string
    jurisdiction: 'BR' | 'EU' | 'US'
    locale: Locale
    onboardingStep: number
  }) => void
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
})

export function AuthModal({ open, mode, onModeChange, onClose, onSuccess }: AuthModalProps) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      setName('')
    }
  }, [open, mode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signup') {
        const parsed = schema.safeParse({ email, password, name })
        if (!parsed.success) {
          const issue = parsed.error.issues[0]
          if (issue.path.includes('password') && issue.code === 'too_small') {
            toast.error(t('auth.error.weak_password'))
          } else if (issue.path.includes('name')) {
            toast.error(t('auth.error.name_required'))
          } else {
            toast.error(t('common.email'))
          }
          return
        }
      } else {
        if (!email || !password) {
          toast.error(t('auth.error.invalid_credentials'))
          return
        }
      }
      const endpoint = mode === 'signup' ? '/api/auth/register' : '/api/auth/login'
      const payload = mode === 'signup' ? { email, password, name } : { email, password }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'EMAIL_TAKEN') toast.error(t('auth.error.email_taken'))
        else if (data.error === 'INVALID_CREDENTIALS') toast.error(t('auth.error.invalid_credentials'))
        else toast.error(t('toast.error'))
        return
      }
      onSuccess(data.user)
    } catch (err) {
      toast.error(t('toast.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-serif-display text-base">{t('brand.name')}</span>
          </div>
          <DialogTitle className="font-serif-display text-2xl">
            {mode === 'signup' ? t('auth.signup.title') : t('auth.signin.title')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'signup' ? t('auth.signup.subtitle') : t('auth.signin.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="name">{t('common.name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                disabled={loading}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('common.email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('common.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'signup' ? t('auth.signup.button') : t('auth.signin.button')}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => onModeChange(mode === 'signup' ? 'signin' : 'signup')}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline text-center mt-2"
        >
          {mode === 'signup' ? t('auth.toggle.to.signin') : t('auth.toggle.to.signup')}
        </button>
      </DialogContent>
    </Dialog>
  )
}
