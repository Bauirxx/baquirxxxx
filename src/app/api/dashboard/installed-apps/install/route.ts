import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'

const schema = z.object({
  deviceIds: z.array(z.string()).min(1),
  apkName: z.string().optional(),
})

// POST — instala um APK em vários aparelhos (mock — regista apenas)
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const { deviceIds, apkName } = parsed.data
  const devices = await db.device.findMany({
    where: { id: { in: deviceIds }, userId: user.id },
    select: { id: true, name: true },
  })

  // Mock: simulamos a instalação. Em produção, isto faria upload do APK e invocaria:
  // - ADB: `adb install -r /path/to/app.apk`
  // - Companion: upload via WebSocket
  await auditLog(user.id, 'app_installed', null, {
    apkName: apkName ?? 'unknown.apk',
    deviceCount: devices.length,
    deviceNames: devices.map(d => d.name),
  }, req)

  return json({ ok: true, count: devices.length, simulated: true })
}
