import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'
import type { OverviewStatsDTO } from '@/lib/types'

export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const devices = await db.device.findMany({
    where: { userId: user.id },
    select: { id: true, status: true },
  })
  const deviceIds = devices.map(d => d.id)
  const totalDevices = devices.length
  const activeDevices = devices.filter(d => d.status === 'active').length
  const pendingDevices = devices.filter(d => d.status === 'pending').length

  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [lastLocation, unresolvedAlerts, unresolvedSos, callsToday, smsToday, appUsageToday, activeScreenSessions, syncEvents24h, installedAppsCount] = await Promise.all([
    db.locationEvent.findFirst({
      where: { deviceId: { in: deviceIds } },
      orderBy: { timestamp: 'desc' },
    }),
    db.socialAlert.count({
      where: { deviceId: { in: deviceIds }, resolved: false },
    }),
    db.sosEvent.count({
      where: { deviceId: { in: deviceIds }, resolved: false },
    }),
    db.callEvent.count({
      where: { deviceId: { in: deviceIds }, timestamp: { gte: last24h } },
    }),
    db.smsEvent.count({
      where: { deviceId: { in: deviceIds }, timestamp: { gte: last24h } },
    }),
    db.appUsageEvent.findMany({
      where: { deviceId: { in: deviceIds }, timestamp: { gte: last24h } },
      select: { foregroundMs: true },
    }),
    db.screenSession.count({
      where: { userId: user.id, status: 'active' },
    }),
    db.syncEvent.count({
      where: { userId: user.id, timestamp: { gte: last24h } },
    }),
    db.installedApp.count({
      where: { deviceId: { in: deviceIds } },
    }),
  ])

  const screenTimeTodayMs = appUsageToday.reduce((sum, e) => sum + e.foregroundMs, 0)

  const stats: OverviewStatsDTO = {
    totalDevices,
    activeDevices,
    pendingDevices,
    lastLocation: lastLocation
      ? {
          latitude: lastLocation.latitude,
          longitude: lastLocation.longitude,
          timestamp: lastLocation.timestamp.toISOString(),
        }
      : null,
    unresolvedAlerts,
    unresolvedSos,
    callsToday,
    smsToday,
    screenTimeTodayMs,
    activeScreenSessions,
    syncEvents24h,
    installedApps: installedAppsCount,
  }

  return json(stats)
}
