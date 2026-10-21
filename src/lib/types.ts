// ScreenPorter — Tipos compartilhados
export type Jurisdiction = 'BR' | 'EU' | 'US'
export type Locale = 'pt-BR' | 'en'
export type DeviceStatus = 'pending' | 'active' | 'offline' | 'revoked'
export type ConnectionType = 'usb' | 'wifi' | 'tailscale' | 'companion'
export type SyncMode = 'rigid' | 'adaptive' | 'independent'
export type RemoteCommandType = 'touch' | 'key' | 'text' | 'back' | 'home' | 'recents' | 'power' | 'volume_up' | 'volume_down' | 'open_app' | 'reboot'

export type DashboardView =
  | 'overview'
  | 'location'
  | 'calls'
  | 'sms'
  | 'apps'
  | 'browser'
  | 'alerts'
  | 'sos'
  | 'screen-mirror'
  | 'remote-control'
  | 'sync'
  | 'metrics'
  | 'devices'
  | 'settings'

export type AppShellView =
  | 'landing'
  | 'auth'
  | 'onboarding'
  | 'dashboard'

export interface DeviceDTO {
  id: string
  name: string
  model: string
  osVersion: string
  status: DeviceStatus
  installCode: string
  consentGiven: boolean
  lastSeenAt: string | null
  childName: string | null
  connectionType: ConnectionType
  ipAddress: string | null
  port: number | null
  screenW: number
  screenH: number
}

export interface InstalledAppDTO {
  id: string
  packageName: string
  appName: string
  versionName: string | null
  versionCode: number | null
  systemApp: boolean
  firstSeenAt: string
  updatedAt: string
}

export interface SyncConfigDTO {
  mode: SyncMode
  toleranceMs: number
  marginMs: number
  elementBased: boolean
}

export interface ScreenSessionDTO {
  id: string
  deviceId: string
  codec: string
  fps: number
  bitrate: number
  width: number | null
  height: number | null
  startedAt: string
  endedAt: string | null
  status: 'active' | 'ended' | 'failed'
  framesReceived: number
  bytesReceived: number
}

export interface ScreenshotDTO {
  id: string
  deviceId: string
  width: number
  height: number
  takenAt: string
  // dataUrl omitted from list responses (only returned when explicitly requested)
}

export interface SyncEventDTO {
  id: string
  sourceDeviceId: string | null
  commandType: RemoteCommandType
  mode: SyncMode
  successCount: number
  failCount: number
  avgDeviation: number
  maxDeviation: number
  timestamp: string
  targets: Array<{ deviceId: string; deviceName: string; success: boolean; deviationMs: number; error?: string }>
}

export interface SyncMetricsDTO {
  commands24h: number
  precision: number // 0..1
  avgDeviation: number
  maxDeviation: number
  failures24h: number
  timeouts24h: number
  commandsPerHour: Array<{ hour: string; count: number }>
  deviationByDevice: Array<{ deviceId: string; deviceName: string; deviation: number }>
  recentEvents: SyncEventDTO[]
}

export interface TailscaleStatusDTO {
  installed: boolean
  connected: boolean
  version: string | null
  tailnetName: string | null
  thisDeviceIp: string | null
  thisDeviceName: string | null
  peers: Array<{ hostname: string; ip: string; os: string; online: boolean }>
}

export interface OverviewStatsDTO {
  totalDevices: number
  activeDevices: number
  pendingDevices: number
  lastLocation: { latitude: number; longitude: number; timestamp: string } | null
  unresolvedAlerts: number
  unresolvedSos: number
  callsToday: number
  smsToday: number
  screenTimeTodayMs: number
  // ScreenPorter additions
  activeScreenSessions: number
  syncEvents24h: number
  installedApps: number
}

export interface LocationEventDTO {
  id: string
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  battery: number | null
  timestamp: string
}

export interface CallEventDTO {
  id: string
  phoneNumber: string
  contactName: string | null
  direction: 'incoming' | 'outgoing' | 'missed'
  duration: number
  timestamp: string
}

export interface SmsEventDTO {
  id: string
  phoneNumber: string
  contactName: string | null
  direction: 'incoming' | 'outgoing'
  body: string
  flagged: boolean
  flagReason: string | null
  timestamp: string
}

export interface AppUsageDTO {
  id: string
  packageName: string
  appName: string
  foregroundMs: number
  dataUsageBytes: number | null
  timestamp: string
}

export interface BrowserEventDTO {
  id: string
  url: string
  title: string | null
  category: string | null
  blocked: boolean
  timestamp: string
}

export interface SocialAlertDTO {
  id: string
  platform: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: string
  snippet: string
  actionTaken: string | null
  resolved: boolean
  timestamp: string
}

export interface SosEventDTO {
  id: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  battery: number | null
  trigger: string
  resolved: boolean
  resolvedAt: string | null
  timestamp: string
}

export interface ConsentRecordDTO {
  id: string
  consentType: string
  jurisdiction: string
  legalVersion: string
  accepted: boolean
  ipAddress: string | null
  createdAt: string
}

export interface AuditLogDTO {
  id: string
  action: string
  target: string | null
  metadata: string | null
  ipAddress: string | null
  createdAt: string
}
