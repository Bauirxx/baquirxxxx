import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'
import { broadcastEvent } from '@/lib/realtime-broadcast'
import type { SyncEventDTO } from '@/lib/types'

const schema = z.object({
  deviceIds: z.array(z.string()).min(1),
  commandType: z.enum(['touch', 'key', 'text', 'back', 'home', 'recents', 'power', 'volume_up', 'volume_down', 'open_app', 'reboot']).default('touch'),
  payload: z.record(z.any()).optional(),
})

// POST — envia um comando sincronizado para vários aparelhos.
// Em vez de simular sucesso/falha com random, faz broadcast real via WebSocket
// para os agentes Android subscritos, e retorna a contagem baseada em quem tem
// sessão de ecrã ativa (proxy de "agente presente").
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const { deviceIds, commandType, payload } = parsed.data

  // Buscar config do user (cria default se não existir)
  let syncConfig = await db.syncConfig.findUnique({ where: { userId: user.id } })
  if (!syncConfig) {
    syncConfig = await db.syncConfig.create({ data: { userId: user.id } })
  }

  // Buscar devices + verificar se têm sessão de ecrã ativa
  const devices = await db.device.findMany({
    where: { id: { in: deviceIds }, userId: user.id, status: { not: 'revoked' } },
    select: { id: true, name: true },
  })
  if (devices.length === 0) {
    return errorResponse('NO_VALID_DEVICES', 400)
  }

  // Para cada aparelho, broadcast via realtime (o agente Android subscrito recebe)
  // Sem random — sucesso = tem sessão ativa + broadcast entregue ao socket.io
  const targets: Array<{ deviceId: string; deviceName: string; success: boolean; deviationMs: number; error?: string }> = []
  for (const d of devices) {
    const activeSession = await db.screenSession.findFirst({
      where: { deviceId: d.id, status: 'active' },
      select: { id: true, startedAt: true },
    })
    let success = false
    let deviationMs = 0
    let error: string | undefined
    if (!activeSession) {
      error = 'NO_ACTIVE_SESSION'
    } else {
      // Broadcast real do comando para o agente Android via realtime service
      const sent = await broadcastEvent({
        userId: user.id,
        deviceId: d.id,
        event: {
          type: 'remote_command',
          command: commandType,
          payload,
          mode: syncConfig.mode,
          toleranceMs: syncConfig.toleranceMs,
          marginMs: syncConfig.marginMs,
          elementBased: syncConfig.elementBased,
          timestamp: new Date().toISOString(),
        },
      })
      success = sent
      if (!sent) {
        error = 'AGENT_NOT_SUBSCRIBED'
      } else {
        // Desvio real seria reportado pelo agente Android; usamos 0 até lá
        deviationMs = 0
      }
    }
    targets.push({
      deviceId: d.id,
      deviceName: d.name,
      success,
      deviationMs,
      error,
    })
  }

  const successCount = targets.filter(t => t.success).length
  const failCount = targets.length - successCount
  const deviations = targets.map(t => t.deviationMs).filter(d => d > 0)
  const avgDeviation = deviations.length > 0
    ? deviations.reduce((s, d) => s + d, 0) / deviations.length
    : 0
  const maxDeviation = deviations.length > 0 ? Math.max(...deviations) : 0

  const event = await db.syncEvent.create({
    data: {
      userId: user.id,
      commandType,
      mode: syncConfig.mode,
      targetsJson: JSON.stringify(targets),
      successCount,
      failCount,
      avgDeviation,
      maxDeviation,
    },
  })

  await auditLog(user.id, 'sync_broadcast', event.id, {
    commandType,
    mode: syncConfig.mode,
    targetCount: devices.length,
    successCount,
    failCount,
  }, req)

  const dto: SyncEventDTO = {
    id: event.id,
    sourceDeviceId: null,
    commandType: event.commandType as SyncEventDTO['commandType'],
    mode: event.mode as SyncEventDTO['mode'],
    successCount,
    failCount,
    avgDeviation,
    maxDeviation,
    timestamp: event.timestamp.toISOString(),
    targets,
  }

  return json({ ok: true, event: dto })
}
