import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse } from '@/lib/api-helpers'
import type { SyncConfigDTO } from '@/lib/types'

// GET — retorna a config de sync do utilizador (cria default se não existir)
export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  let config = await db.syncConfig.findUnique({ where: { userId: user.id } })
  if (!config) {
    config = await db.syncConfig.create({ data: { userId: user.id } })
  }

  const dto: SyncConfigDTO = {
    mode: config.mode as SyncConfigDTO['mode'],
    toleranceMs: config.toleranceMs,
    marginMs: config.marginMs,
    elementBased: config.elementBased,
  }

  return json(dto)
}
