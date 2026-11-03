import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'

// GET — lista media por dispositivo (com filtros)
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')
  const type = searchParams.get('type') // photo | video | audio
  const flaggedOnly = searchParams.get('flagged') === 'true'
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  const devices = await db.device.findMany({
    where: { userId: user.id, ...(deviceId ? { id: deviceId } : {}) },
    select: { id: true, name: true, child: { select: { name: true } } },
  })
  const deviceIds = devices.map(d => d.id)

  const media = await db.mediaEvent.findMany({
    where: {
      deviceId: { in: deviceIds },
      ...(type ? { type } : {}),
      ...(flaggedOnly ? { flagged: true } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: Math.min(limit, 500),
  })

  return json({
    media: media.map(m => ({
      id: m.id,
      deviceId: m.deviceId,
      type: m.type,
      fileName: m.fileName,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      thumbnail: m.thumbnail,
      flagged: m.flagged,
      flagReason: m.flagReason,
      source: m.source,
      timestamp: m.timestamp.toISOString(),
    })),
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child?.name ?? null })),
  })
}
