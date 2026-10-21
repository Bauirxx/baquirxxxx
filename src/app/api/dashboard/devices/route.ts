import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { getUserOr401, json, errorResponse, parseJsonBody, auditLog } from '@/lib/api-helpers'
import type { DeviceDTO, DeviceStatus } from '@/lib/types'

export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const devices = await db.device.findMany({
    where: { userId: user.id },
    include: { child: true },
    orderBy: { registeredAt: 'desc' },
  })

  const dtos: DeviceDTO[] = devices.map(d => ({
    id: d.id,
    name: d.name,
    model: d.model,
    osVersion: d.osVersion,
    status: d.status as DeviceStatus,
    installCode: d.installCode,
    consentGiven: d.consentGiven,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    childName: d.child?.name ?? null,
    connectionType: d.connectionType as DeviceDTO['connectionType'],
    ipAddress: d.ipAddress,
    port: d.port,
    screenW: d.screenW,
    screenH: d.screenH,
  }))

  // Agrupado por tipo de ligação
  const byConnection = {
    usb: dtos.filter(d => d.connectionType === 'usb'),
    wifi: dtos.filter(d => d.connectionType === 'wifi'),
    tailscale: dtos.filter(d => d.connectionType === 'tailscale'),
    companion: dtos.filter(d => d.connectionType === 'companion'),
  }

  return json({ devices: dtos, byConnection })
}

// POST — revoga acesso do dispositivo
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  if (body.action === 'revoke') {
    if (!body.deviceId) return errorResponse('deviceId required', 400)
    const device = await db.device.findUnique({ where: { id: body.deviceId } })
    if (!device || device.userId !== user.id) return errorResponse('NOT_FOUND', 404)
    await db.device.update({
      where: { id: device.id },
      data: { status: 'revoked', agentToken: null },
    })
    await auditLog(user.id, 'device_revoked', device.id, {}, req)
    return json({ ok: true })
  }
  if (body.action === 'revokeAll') {
    const result = await db.device.updateMany({
      where: { userId: user.id },
      data: { status: 'revoked', agentToken: null },
    })
    await auditLog(user.id, 'devices_revoked_all', null, { count: result.count }, req)
    return json({ ok: true, count: result.count })
  }
  if (body.action === 'pairTailscale') {
    if (!body.deviceId || !body.ip) return errorResponse('deviceId and ip required', 400)
    const device = await db.device.findUnique({ where: { id: body.deviceId } })
    if (!device || device.userId !== user.id) return errorResponse('NOT_FOUND', 404)
    await db.device.update({
      where: { id: device.id },
      data: {
        connectionType: 'tailscale',
        ipAddress: String(body.ip),
        status: 'active',
        lastSeenAt: new Date(),
      },
    })
    await auditLog(user.id, 'device_paired_tailscale', device.id, { ip: String(body.ip), hostname: body.hostname ?? null }, req)
    return json({ ok: true })
  }
  return errorResponse('unknown action', 400)
}
