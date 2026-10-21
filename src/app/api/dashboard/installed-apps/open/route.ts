import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'

const schema = z.object({
  deviceId: z.string(),
  packageName: z.string(),
})

// POST — abre uma app por packageName
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const { deviceId, packageName } = parsed.data
  const device = await db.device.findFirst({ where: { id: deviceId, userId: user.id } })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)

  // Mock: simulamos que o comando foi enviado. Em produção, isto invocaria:
  // - ADB: `adb shell monkey -p <packageName> 1`
  // - Companion: WebSocket msg { type: 'open_app', packageName }
  await auditLog(user.id, 'app_opened', deviceId, { packageName }, req)
  return json({ ok: true, simulated: true })
}
