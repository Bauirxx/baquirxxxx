import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'

export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const devices = await db.device.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      model: true,
      osVersion: true,
      status: true,
      installCode: true,
      connectionType: true,
      ipAddress: true,
      screenW: true,
      screenH: true,
      lastSeenAt: true,
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
          notificationEvents: true,
          mediaEvents: true,
        }
      }
    },
    orderBy: { registeredAt: 'desc' }
  })

  const storage = devices.map(d => ({
    id: d.id,
    name: d.name,
    model: d.model,
    osVersion: d.osVersion,
    status: d.status,
    installCode: d.installCode,
    connectionType: d.connectionType,
    ipAddress: d.ipAddress,
    screenW: d.screenW,
    screenH: d.screenH,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    childName: d.child?.name ?? null,
    storagePath: `/storage/${d.id}/`,
    stats: {
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
      notifications: d._count.notificationEvents,
      media: d._count.mediaEvents,
      totalEvents: d._count.locationEvents + d._count.callEvents + d._count.smsEvents +
        d._count.appUsageEvents + d._count.browserEvents + d._count.socialAlerts + d._count.sosEvents +
        d._count.notificationEvents + d._count.mediaEvents
    }
  }))

  return json({ devices: storage })
}
