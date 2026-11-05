import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'

const schema = z.object({
  deviceId: z.string(),
  sessionId: z.string().optional(),
  // Imagem PNG capturada do canvas do navegador (enviada pelo cliente)
  // Formato: data:image/png;base64,...
  dataUrl: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

// POST — captura um screenshot do ecrã ao vivo
// O navegador envia o conteúdo real do canvas via toDataURL().
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const { deviceId, sessionId, dataUrl, width, height } = parsed.data
  const device = await db.device.findFirst({ where: { id: deviceId, userId: user.id } })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)

  // Limita tamanho do screenshot (~5MB)
  if (dataUrl.length > 5 * 1024 * 1024) {
    return errorResponse('SCREENSHOT_TOO_LARGE', 413)
  }

  const screenshot = await db.screenshot.create({
    data: {
      deviceId,
      sessionId: sessionId ?? null,
      width: width ?? device.screenW,
      height: height ?? device.screenH,
      dataUrl,
    },
  })

  await auditLog(user.id, 'screenshot_taken', screenshot.id, { deviceId, sessionId }, req)
  return json({
    ok: true,
    screenshot: {
      id: screenshot.id,
      deviceId: screenshot.deviceId,
      width: screenshot.width,
      height: screenshot.height,
      takenAt: screenshot.takenAt.toISOString(),
    },
  })
}

// GET — lista screenshots recentes do utilizador
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const screenshots = await db.screenshot.findMany({
    where: { device: { userId: user.id } },
    orderBy: { takenAt: 'desc' },
    take: 12,
    select: { id: true, deviceId: true, width: true, height: true, takenAt: true },
  })
  return json({
    screenshots: screenshots.map(s => ({
      id: s.id,
      deviceId: s.deviceId,
      width: s.width,
      height: s.height,
      takenAt: s.takenAt.toISOString(),
    })),
  })
}
