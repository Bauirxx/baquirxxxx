'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Sidebar, MobileBottomNav } from './sidebar'
import { Topbar } from './topbar'
import { RealtimeProvider } from './realtime-provider'
import { OverviewView } from './views/overview'
import { LocationView } from './views/location'
import { CallsView } from './views/calls'
import { SmsView } from './views/sms'
import { AppsView } from './views/apps'
import { BrowserView } from './views/browser'
import { AlertsView } from './views/alerts'
import { SosView } from './views/sos'
import { DevicesView } from './views/devices'
import { SettingsView } from './views/settings'
import { ScreenMirrorView } from './views/screen-mirror'
import { RemoteControlView } from './views/remote-control'
import { SyncView } from './views/sync'
import { MetricsView } from './views/metrics'
import type { DashboardView, Locale } from '@/lib/types'

interface DashboardLayoutProps {
  user: {
    id: string
    email: string
    name: string
    jurisdiction: 'BR' | 'EU' | 'US'
    locale: Locale
    onboardingStep: number
  }
  currentView: DashboardView
  onViewChange: (view: DashboardView) => void
  onLogout: () => void
  onLocaleChange: (l: Locale) => void
}

export function DashboardLayout({ user, currentView, onViewChange, onLogout, onLocaleChange }: DashboardLayoutProps) {
  const { t } = useI18n()
  const [activeAlerts, setActiveAlerts] = useState(0)
  const [activeSos, setActiveSos] = useState(0)
  // Para a sidebar, o badge é a soma (total de itens pendentes)
  const totalActive = activeAlerts + activeSos

  return (
    <RealtimeProvider userId={user.id}>
      <div className="min-h-screen flex bg-background">
        <Sidebar
          currentView={currentView}
          onViewChange={onViewChange}
          onLogout={onLogout}
          userName={user.name}
          activeAlerts={totalActive}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar
            userName={user.name}
            userEmail={user.email}
            onLogout={onLogout}
            onLocaleChange={onLocaleChange}
            currentView={currentView}
            onViewChange={onViewChange}
          />
          <main className="flex-1 overflow-y-auto scrollbar-thin pb-20 md:pb-8">
            <div className="container mx-auto px-4 py-6 sm:py-8 max-w-7xl">
              <div className="mb-6">
                <h1 className="font-serif-display text-2xl sm:text-3xl text-foreground">
                  {currentView === 'overview' && t('overview.title')}
                  {currentView === 'location' && t('location.title')}
                  {currentView === 'calls' && t('calls.title')}
                  {currentView === 'sms' && t('sms.title')}
                  {currentView === 'apps' && t('apps.title')}
                  {currentView === 'browser' && t('browser.title')}
                  {currentView === 'alerts' && t('alerts.title')}
                  {currentView === 'sos' && t('sos.title')}
                  {currentView === 'screen-mirror' && t('screen.title')}
                  {currentView === 'remote-control' && t('control.title')}
                  {currentView === 'sync' && t('sync.title')}
                  {currentView === 'metrics' && t('metrics.title')}
                  {currentView === 'devices' && t('devices.title')}
                  {currentView === 'settings' && t('settings.title')}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentView === 'overview' && t('overview.subtitle')}
                  {currentView === 'location' && t('location.subtitle')}
                  {currentView === 'calls' && t('calls.subtitle')}
                  {currentView === 'sms' && t('sms.subtitle')}
                  {currentView === 'apps' && t('apps.subtitle')}
                  {currentView === 'browser' && t('browser.subtitle')}
                  {currentView === 'alerts' && t('alerts.subtitle')}
                  {currentView === 'sos' && t('sos.subtitle')}
                  {currentView === 'screen-mirror' && t('screen.subtitle')}
                  {currentView === 'remote-control' && t('control.subtitle')}
                  {currentView === 'sync' && t('sync.subtitle')}
                  {currentView === 'metrics' && t('metrics.subtitle')}
                  {currentView === 'devices' && t('devices.subtitle')}
                  {currentView === 'settings' && t('settings.subtitle')}
                </p>
              </div>

              {currentView === 'overview' && <OverviewView user={user} onViewChange={onViewChange} onAlertsChange={setActiveAlerts} onSosChange={setActiveSos} />}
              {currentView === 'location' && <LocationView userId={user.id} />}
              {currentView === 'calls' && <CallsView />}
              {currentView === 'sms' && <SmsView />}
              {currentView === 'apps' && <AppsView />}
              {currentView === 'browser' && <BrowserView />}
              {currentView === 'alerts' && <AlertsView onAlertsChange={setActiveAlerts} />}
              {currentView === 'sos' && <SosView onSosChange={setActiveSos} />}
              {currentView === 'screen-mirror' && <ScreenMirrorView onViewChange={onViewChange} />}
              {currentView === 'remote-control' && <RemoteControlView />}
              {currentView === 'sync' && <SyncView />}
              {currentView === 'metrics' && <MetricsView />}
              {currentView === 'devices' && <DevicesView />}
              {currentView === 'settings' && <SettingsView user={user} onLocaleChange={onLocaleChange} />}
            </div>
          </main>
        </div>
        <MobileBottomNav currentView={currentView} onViewChange={onViewChange} activeAlerts={activeAlerts} />
      </div>
    </RealtimeProvider>
  )
}
