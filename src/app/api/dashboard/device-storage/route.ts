import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse } from '@/lib/api-helpers'

// GET — retorna a estrutura de armazenamento por dispositivo
// Cada dispositivo tem uma "pasta virtual" com os seus screenshots, events, etc.
export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const devices = await db.device.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      status: true,
      child: { select: { name: true } },
      _count: {
        select: {
          locationEvents: true,
          callEvents: true,
          smsEvents: true,
          appUsageEvents: true,
          browserEvents: true,
          socialAlerts: true,
          sosEvents: true,
          installedApps: true,
          screenSessions: true,
          screenshots: true,
        }
      }
    },
    orderBy: { registeredAt: 'desc' }
  })

  // Cada dispositivo tem um "path" virtual: /devices/{deviceId}/
  const storage = devices.map(d => ({
    deviceId: d.id,
    deviceName: d.name,
    childName: d.child?.name ?? '—',
    status: d.status,
    storagePath: `/devices/${d.id}/`,
    dataCount: {
      locations: d._count.locationEvents,
      calls: d._count.callEvents,
      sms: d._count.smsEvents,
      appUsage: d._count.appUsageEvents,
      browser: d._count.browserEvents,
      alerts: d._count.socialAlerts,
      sos: d._count.sosEvents,
      installedApps: d._count.installedApps,
      screenSessions: d._count.screenSessions,
      screenshots: d._count.screenshots,
    },
    totalEvents: d._count.locationEvents + d._count.callEvents + d._count.smsEvents +
      d._count.appUsageEvents + d._count.browserEvents + d._count.socialAlerts + d._count.sosEvents
  }))

  return json({ devices: storage })
}
