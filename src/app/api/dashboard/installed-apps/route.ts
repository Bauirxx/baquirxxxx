import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse } from '@/lib/api-helpers'
import type { InstalledAppDTO } from '@/lib/types'

// GET — lista apps instaladas num aparelho (apenas dados reais reportados pelo agente Android)
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')
  if (!deviceId) return errorResponse('deviceId required', 400)

  const device = await db.device.findFirst({ where: { id: deviceId, userId: user.id } })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)

  const apps = await db.installedApp.findMany({
    where: { deviceId },
    orderBy: [{ systemApp: 'asc' }, { appName: 'asc' }],
  })

  // NÃO auto-popular com mocks. Retornar lista vazia até o agente Android reportar.
  const dtos: InstalledAppDTO[] = apps.map(a => ({
    id: a.id,
    packageName: a.packageName,
    appName: a.appName,
    versionName: a.versionName,
    versionCode: a.versionCode,
    systemApp: a.systemApp,
    firstSeenAt: a.firstSeenAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }))

  return json({ apps: dtos })
}
