import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'
import { sendToCompanion } from '@/lib/relay'

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

  // Envia o comando REAL "open_app" à app Companion via o relé — a app abre a
  // aplicação pelo packageName (campo `text`, ver ControlAccessibilityService).
  const delivered = await sendToCompanion(user.id, { command: 'open_app', text: packageName })
  await auditLog(user.id, 'app_opened', deviceId, { packageName, delivered }, req)
  return json({ ok: true, delivered })
}
