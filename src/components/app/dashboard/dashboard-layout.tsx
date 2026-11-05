'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Sidebar, MobileBottomNav } from './sidebar'
import { Topbar } from './topbar'
import { RealtimeProvider } from './realtime-provider'
import { DeviceProvider } from './device-context'
import { PageHeader } from './components/page-header'
import { OverviewView } from './views/overview'
import { LocationView } from './views/location'
import { CallsView } from './views/calls'
import { SmsView } from './views/sms'
import { AppsView } from './views/apps'
import { BrowserView } from './views/browser'
import { AlertsView } from './views/alerts'
import { NotificationsView } from './views/notifications'
import { MediaView } from './views/media'
import { SosView } from './views/sos'
import { DevicesView } from './views/devices'
import { SettingsView } from './views/settings'
import { ScreenMirrorView } from './views/screen-mirror'
import { RemoteControlView } from './views/remote-control'
import { SyncView } from './views/sync'
import { MetricsView } from './views/metrics'
import {
  LayoutDashboard, MapPin, Phone, MessageSquare, Clock, Globe2,
  AlertTriangle, MessageCircle, Image as ImageIcon, Siren,
  MonitorPlay, Gamepad2, RefreshCw, BarChart3, Smartphone, Settings,
  type LucideIcon,
} from 'lucide-react'
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

type ViewMeta = {
  icon: LucideIcon
  titleKey: string
  subtitleKey: string
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'info'
}

const VIEW_META: Record<DashboardView, ViewMeta> = {
  overview:        { icon: LayoutDashboard, titleKey: 'overview.title',     subtitleKey: 'overview.subtitle',     tone: 'primary' },
  location:        { icon: MapPin,           titleKey: 'location.title',     subtitleKey: 'location.subtitle',     tone: 'info' },
  calls:           { icon: Phone,            titleKey: 'calls.title',        subtitleKey: 'calls.subtitle',        tone: 'info' },
  sms:             { icon: MessageSquare,    titleKey: 'sms.title',          subtitleKey: 'sms.subtitle',          tone: 'info' },
  apps:            { icon: Clock,            titleKey: 'apps.title',         subtitleKey: 'apps.subtitle',         tone: 'default' },
  browser:         { icon: Globe2,           titleKey: 'browser.title',      subtitleKey: 'browser.subtitle',      tone: 'default' },
  alerts:          { icon: AlertTriangle,    titleKey: 'alerts.title',       subtitleKey: 'alerts.subtitle',       tone: 'warning' },
  notifications:   { icon: MessageCircle,    titleKey: 'notifications.title',subtitleKey: 'notifications.subtitle',tone: 'primary' },
  media:           { icon: ImageIcon,        titleKey: 'media.title',        subtitleKey: 'media.subtitle',        tone: 'primary' },
  sos:             { icon: Siren,            titleKey: 'sos.title',          subtitleKey: 'sos.subtitle',          tone: 'danger' },
  'screen-mirror': { icon: MonitorPlay,      titleKey: 'screen.title',       subtitleKey: 'screen.subtitle',       tone: 'primary' },
  'remote-control':{ icon: Gamepad2,         titleKey: 'control.title',      subtitleKey: 'control.subtitle',      tone: 'primary' },
  sync:            { icon: RefreshCw,        titleKey: 'sync.title',         subtitleKey: 'sync.subtitle',         tone: 'default' },
  metrics:         { icon: BarChart3,        titleKey: 'metrics.title',      subtitleKey: 'metrics.subtitle',      tone: 'default' },
  devices:         { icon: Smartphone,       titleKey: 'devices.title',      subtitleKey: 'devices.subtitle',      tone: 'default' },
  settings:        { icon: Settings,         titleKey: 'settings.title',     subtitleKey: 'settings.subtitle',     tone: 'default' },
}

export function DashboardLayout({ user, currentView, onViewChange, onLogout, onLocaleChange }: DashboardLayoutProps) {
  const { t } = useI18n()
  const [activeAlerts, setActiveAlerts] = useState(0)
  const [activeSos, setActiveSos] = useState(0)
  const totalActive = activeAlerts + activeSos
  const meta = VIEW_META[currentView] ?? VIEW_META.overview

  return (
    <RealtimeProvider userId={user.id}>
      <DeviceProvider userId={user.id}>
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
              <PageHeader
                icon={meta.icon}
                title={t(meta.titleKey)}
                subtitle={t(meta.subtitleKey)}
                tone={meta.tone}
              />

              {currentView === 'overview' && <OverviewView user={user} onViewChange={onViewChange} onAlertsChange={setActiveAlerts} onSosChange={setActiveSos} />}
              {currentView === 'location' && <LocationView userId={user.id} />}
              {currentView === 'calls' && <CallsView />}
              {currentView === 'sms' && <SmsView />}
              {currentView === 'apps' && <AppsView />}
              {currentView === 'browser' && <BrowserView />}
              {currentView === 'alerts' && <AlertsView onAlertsChange={setActiveAlerts} />}
              {currentView === 'notifications' && <NotificationsView />}
              {currentView === 'media' && <MediaView />}
              {currentView === 'sos' && <SosView onSosChange={setActiveSos} />}
              {currentView === 'screen-mirror' && <ScreenMirrorView onViewChange={onViewChange} />}
              {currentView === 'remote-control' && <RemoteControlView />}
              {currentView === 'sync' && <SyncView />}
              {currentView === 'metrics' && <MetricsView />}
              {currentView === 'devices' && <DevicesView user={user} />}
              {currentView === 'settings' && <SettingsView user={user} onLocaleChange={onLocaleChange} />}
            </div>
          </main>
        </div>
        <MobileBottomNav currentView={currentView} onViewChange={onViewChange} activeAlerts={activeAlerts} />
        </div>
      </DeviceProvider>
    </RealtimeProvider>
  )
}
