import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'
import type { BrowserEventDTO } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  const devices = await db.device.findMany({
    where: { userId: user.id, ...(deviceId ? { id: deviceId } : {}) },
    select: { id: true, name: true, child: { select: { name: true } } },
  })
  const deviceIds = devices.map(d => d.id)

  const events = await db.browserEvent.findMany({
    where: { deviceId: { in: deviceIds } },
    orderBy: { timestamp: 'desc' },
    take: Math.min(limit, 500),
  })

  const dtos: BrowserEventDTO[] = events.map(e => ({
    id: e.id,
    url: e.url,
    title: e.title,
    category: e.category,
    blocked: e.blocked,
    timestamp: e.timestamp.toISOString(),
  }))

  return json({
    events: dtos,
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child.name })),
  })
}
