import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'

// GET — lista notificações capturadas (com filtros opcionais)
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')
  const platform = searchParams.get('platform')
  const flaggedOnly = searchParams.get('flagged') === 'true'
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  const devices = await db.device.findMany({
    where: { userId: user.id, ...(deviceId ? { id: deviceId } : {}) },
    select: { id: true, name: true, child: { select: { name: true } } },
  })
  const deviceIds = devices.map(d => d.id)

  const events = await db.notificationEvent.findMany({
    where: {
      deviceId: { in: deviceIds },
      ...(platform ? { platform } : {}),
      ...(flaggedOnly ? { flagged: true } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: Math.min(limit, 500),
  })

  const dtos = events.map(e => ({
    id: e.id,
    deviceId: e.deviceId,
    platform: e.platform,
    packageName: e.packageName,
    title: e.title,
    text: e.text,
    hasImage: e.hasImage,
    imageBase64: e.imageBase64,
    hasAudio: e.hasAudio,
    audioUri: e.audioUri,
    flagged: e.flagged,
    flagReason: e.flagReason,
    severity: e.severity,
    timestamp: e.timestamp.toISOString(),
  }))

  return json({
    events: dtos,
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child?.name ?? null })),
  })
}
