import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'
import { sendToCompanion } from '@/lib/relay'
import type { RemoteCommandType } from '@/lib/types'

const schema = z.object({
  deviceId: z.string(),
  command: z.enum(['touch', 'key', 'text', 'back', 'home', 'recents', 'power', 'volume_up', 'volume_down', 'open_app', 'reboot', 'stealth_on', 'stealth_off']),
  payload: z.record(z.any()).optional(),
})

// POST — envia um comando de controlo remoto a um aparelho
// Mock: regista no audit log. Em produção invocaria ADB shell input ou WebSocket para companion.
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const { deviceId, command, payload } = parsed.data
  const device = await db.device.findFirst({ where: { id: deviceId, userId: user.id } })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)

  // Envia o comando REAL à app Companion via o relé (WebSocket).
  // A app (ControlAccessibilityService) espera x/y normalizados 0..1; o painel
  // envia 0..100, por isso convertemos aqui.
  const p = (payload ?? {}) as Record<string, number | undefined>
  const message: Record<string, unknown> = { command }
  if (p.x != null) message.x = p.x / 100
  if (p.y != null) message.y = p.y / 100
  if (p.duration != null) message.duration = p.duration
  const delivered = await sendToCompanion(user.id, message)

  await auditLog(user.id, 'remote_control', deviceId, { command, payload, delivered }, req)
  await db.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date() },
  })

  return json({ ok: true, delivered, command })
}

// GET — histórico de comandos deste utilizador (do audit log)
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const logs = await db.auditLog.findMany({
    where: { userId: user.id, action: 'remote_control' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const events = logs.map(l => {
    let payload: any = null
    try { payload = l.metadata ? JSON.parse(l.metadata) : null } catch {}
    return {
      id: l.id,
      deviceId: l.target ?? '',
      command: (payload?.command ?? 'unknown') as RemoteCommandType,
      payload: payload?.payload ?? null,
      timestamp: l.createdAt.toISOString(),
      status: 'ok' as const,
    }
  })

  return json({ events })
}
