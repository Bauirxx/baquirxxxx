import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'

const schema = z.object({
  mode: z.enum(['rigid', 'adaptive', 'independent']).optional(),
  toleranceMs: z.number().int().min(0).max(2000).optional(),
  marginMs: z.number().int().min(0).max(2000).optional(),
  elementBased: z.boolean().optional(),
})

// POST — atualiza a config de sync
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const data = {
    ...(parsed.data.mode ? { mode: parsed.data.mode } : {}),
    ...(parsed.data.toleranceMs !== undefined ? { toleranceMs: parsed.data.toleranceMs } : {}),
    ...(parsed.data.marginMs !== undefined ? { marginMs: parsed.data.marginMs } : {}),
    ...(parsed.data.elementBased !== undefined ? { elementBased: parsed.data.elementBased } : {}),
  }

  let config = await db.syncConfig.findUnique({ where: { userId: user.id } })
  if (!config) {
    config = await db.syncConfig.create({ data: { userId: user.id, ...data } })
  } else {
    config = await db.syncConfig.update({ where: { userId: user.id }, data })
  }

  await auditLog(user.id, 'sync_config_changed', null, parsed.data, req)
  return json({
    ok: true,
    config: {
      mode: config.mode,
      toleranceMs: config.toleranceMs,
      marginMs: config.marginMs,
      elementBased: config.elementBased,
    },
  })
}
