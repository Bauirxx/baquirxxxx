import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, parseJsonBody } from '@/lib/api-helpers'
import type { SocialAlertDTO } from '@/lib/types'
import { auditLog } from '@/lib/api-helpers'

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

  const alerts = await db.socialAlert.findMany({
    where: { deviceId: { in: deviceIds } },
    orderBy: { timestamp: 'desc' },
    take: Math.min(limit, 500),
  })

  const dtos: SocialAlertDTO[] = alerts.map(a => ({
    id: a.id,
    platform: a.platform,
    severity: a.severity as SocialAlertDTO['severity'],
    category: a.category,
    snippet: a.snippet,
    actionTaken: a.actionTaken,
    resolved: a.resolved,
    timestamp: a.timestamp.toISOString(),
  }))

  return json({
    events: dtos,
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child.name })),
  })
}

// POST — resolve um alerta
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body || !body.alertId) return errorResponse('alertId required', 400)
  const alert = await db.socialAlert.findUnique({ where: { id: body.alertId }, include: { device: true } })
  if (!alert || alert.device.userId !== user.id) return errorResponse('NOT_FOUND', 404)
  await db.socialAlert.update({ where: { id: alert.id }, data: { resolved: true } })
  await auditLog(user.id, 'alert_resolved', alert.id, {}, req)
  return json({ ok: true })
}
