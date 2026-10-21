'use client'

import { useI18n } from '@/lib/i18n/context'
import { useRealtime } from './realtime-provider'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Wifi, WifiOff, Moon, Sun, Globe, LogOut, ShieldCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { DashboardView } from '@/lib/types'

interface TopbarProps {
  userName: string
  userEmail: string
  onLogout: () => void
  onLocaleChange: (l: 'pt-BR' | 'en') => void
  currentView: DashboardView
  onViewChange: (view: DashboardView) => void
}

export function Topbar({ userName, userEmail, onLogout, onLocaleChange, currentView, onViewChange }: TopbarProps) {
  const { t, locale } = useI18n()
  const { connected } = useRealtime()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  // Lista compacta para mobile bottom-nav (mostra mais um botão para acesso a outras views)
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* Brand mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
            <ShieldCheck className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-serif-display text-base">{t('brand.name')}</span>
        </div>

        {/* Realtime status */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-soft-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <Wifi className="h-3.5 w-3.5" />
              {t('rt.connected')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <WifiOff className="h-3.5 w-3.5" />
              {t('rt.disconnected')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Mobile view selector (compact) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden">
                {t(`sidebar.${currentView}`)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{t('sidebar.group.monitoring')}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onViewChange('overview')}>{t('sidebar.overview')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('location')}>{t('sidebar.location')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('calls')}>{t('sidebar.calls')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('sms')}>{t('sidebar.sms')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('apps')}>{t('sidebar.apps')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('browser')}>{t('sidebar.browser')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('alerts')}>{t('sidebar.alerts')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('sos')}>{t('sidebar.sos')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('sidebar.group.control')}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onViewChange('screen-mirror')}>{t('sidebar.screen-mirror')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('remote-control')}>{t('sidebar.remote-control')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('sync')}>{t('sidebar.sync')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('metrics')}>{t('sidebar.metrics')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onViewChange('devices')}>{t('sidebar.devices')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('settings')}>{t('sidebar.settings')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Language toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => onLocaleChange(locale === 'pt-BR' ? 'en' : 'pt-BR')}
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs">{locale === 'pt-BR' ? 'PT' : 'EN'}</span>
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {userName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{userName}</span>
                  <span className="text-xs text-muted-foreground truncate">{userEmail}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                {t('dashboard.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
