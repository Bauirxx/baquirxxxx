import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, parseJsonBody, auditLog } from '@/lib/api-helpers'
import type { SosEventDTO } from '@/lib/types'

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

  const events = await db.sosEvent.findMany({
    where: { deviceId: { in: deviceIds } },
    orderBy: { timestamp: 'desc' },
    take: 200,
  })

  const dtos: SosEventDTO[] = events.map(e => ({
    id: e.id,
    latitude: e.latitude,
    longitude: e.longitude,
    accuracy: e.accuracy,
    battery: e.battery,
    trigger: e.trigger,
    resolved: e.resolved,
    resolvedAt: e.resolvedAt?.toISOString() ?? null,
    timestamp: e.timestamp.toISOString(),
  }))

  return json({
    events: dtos,
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child.name })),
  })
}

// POST — resolve um SOS
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body || !body.sosId) return errorResponse('sosId required', 400)
  const sos = await db.sosEvent.findUnique({ where: { id: body.sosId }, include: { device: true } })
  if (!sos || sos.device.userId !== user.id) return errorResponse('NOT_FOUND', 404)
  await db.sosEvent.update({
    where: { id: sos.id },
    data: { resolved: true, resolvedAt: new Date(), resolvedBy: user.id },
  })
  await auditLog(user.id, 'sos_resolved', sos.id, {}, req)
  return json({ ok: true })
}
