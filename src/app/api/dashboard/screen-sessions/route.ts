import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'
import type { ScreenSessionDTO } from '@/lib/types'

// GET — lista sessões ativas e recentes
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const sessions = await db.screenSession.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: 'desc' },
    take: 20,
  })

  const dtos: ScreenSessionDTO[] = sessions.map(s => ({
    id: s.id,
    deviceId: s.deviceId,
    codec: s.codec,
    fps: s.fps,
    bitrate: s.bitrate,
    width: s.width,
    height: s.height,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    status: s.status as ScreenSessionDTO['status'],
    framesReceived: s.framesReceived,
    bytesReceived: s.bytesReceived,
  }))

  const active = dtos.filter(s => s.status === 'active')
  return json({ sessions: dtos, activeCount: active.length })
}

// POST — inicia uma nova sessão de espelhamento
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body || !body.deviceId) return errorResponse('deviceId required', 400)

  const device = await db.device.findFirst({ where: { id: body.deviceId, userId: user.id } })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)
  if (device.status === 'revoked') return errorResponse('DEVICE_REVOKED', 403)

  // Encerra sessões anteriores ativas neste aparelho
  await db.screenSession.updateMany({
    where: { deviceId: device.id, status: 'active' },
    data: { status: 'ended', endedAt: new Date() },
  })

  const session = await db.screenSession.create({
    data: {
      deviceId: device.id,
      userId: user.id,
      codec: 'H264',
      fps: 30,
      bitrate: 2_000_000,
      width: device.screenW,
      height: device.screenH,
      status: 'active',
      framesReceived: 0,
      bytesReceived: 0,
    },
  })

  // Marca aparelho como ativo
  await db.device.update({
    where: { id: device.id },
    data: { status: 'active', lastSeenAt: new Date() },
  })

  await auditLog(user.id, 'screen_session_started', session.id, { deviceId: device.id }, req)
  return json({
    session: {
      id: session.id,
      deviceId: session.deviceId,
      codec: session.codec,
      fps: session.fps,
      bitrate: session.bitrate,
      width: session.width,
      height: session.height,
      startedAt: session.startedAt.toISOString(),
      endedAt: null,
      status: session.status,
      framesReceived: session.framesReceived,
      bytesReceived: session.bytesReceived,
    } as ScreenSessionDTO,
  })
}
