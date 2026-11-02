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

  // HONESTO: a instalação remota silenciosa de APK NÃO é suportada pela app sem
  // Device Owner (configuração opcional via adb). Não fingimos sucesso.
  await auditLog(user.id, 'app_install_attempt', null, {
    apkName: apkName ?? null,
    deviceCount: devices.length,
    deviceNames: devices.map(d => d.name),
    supported: false,
  }, req)

  return json({
    ok: false,
    supported: false,
    count: devices.length,
    message: 'Instalação remota de APK requer Device Owner (não configurado neste aparelho).',
  })
}
