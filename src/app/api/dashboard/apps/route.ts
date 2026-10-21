import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'
import type { AppUsageDTO } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')

  const devices = await db.device.findMany({
    where: { userId: user.id, ...(deviceId ? { id: deviceId } : {}) },
    select: { id: true, name: true, child: { select: { name: true } } },
  })
  const deviceIds = devices.map(d => d.id)

  // Últimas 24h, agrupadas por package (soma foregroundMs)
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const events = await db.appUsageEvent.findMany({
    where: { deviceId: { in: deviceIds }, timestamp: { gte: last24h } },
    orderBy: { timestamp: 'desc' },
  })

  // Agrupar por packageName, somar foregroundMs
  const map = new Map<string, { packageName: string; appName: string; foregroundMs: number; dataUsageBytes: number; timestamp: string }>()
  for (const e of events) {
    const cur = map.get(e.packageName)
    if (cur) {
      cur.foregroundMs += e.foregroundMs
      cur.dataUsageBytes = (cur.dataUsageBytes ?? 0) + (e.dataUsageBytes ?? 0)
    } else {
      map.set(e.packageName, {
        packageName: e.packageName,
        appName: e.appName,
        foregroundMs: e.foregroundMs,
        dataUsageBytes: e.dataUsageBytes ?? 0,
        timestamp: e.timestamp.toISOString(),
      })
    }
  }

  const dtos: AppUsageDTO[] = Array.from(map.values())
    .map(v => ({
      id: v.packageName,
      packageName: v.packageName,
      appName: v.appName,
      foregroundMs: v.foregroundMs,
      dataUsageBytes: v.dataUsageBytes,
      timestamp: v.timestamp,
    }))
    .sort((a, b) => b.foregroundMs - a.foregroundMs)

  return json({
    events: dtos,
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child.name })),
  })
}
