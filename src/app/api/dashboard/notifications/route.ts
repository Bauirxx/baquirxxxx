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

  // Para notificações de media (foto/áudio/vídeo sem conteúdo inline),
  // procurar o ficheiro real no MediaEvent (mesmo device, timestamp próximo, source=whatsapp)
  const MEDIA_WINDOW_MS = 60_000 // 60 segundos de janela
  const mediaNotifs = events.filter(e => {
    const t = ((e.text || '') + ' ' + (e.title || '')).toLowerCase()
    return (
      (!e.imageBase64 && !e.audioBase64) &&
      (t.includes('📷') || t.includes('foto') || t.includes('photo') ||
       t.includes('🎤') || t.includes('voz') || t.includes('voice') || t.includes('ptt') ||
       t.includes('🎥') || t.includes('vídeo') || t.includes('video') ||
       t.includes('📄') || t.includes('documento') || t.includes('document'))
    )
  })

  // Buscar media correspondente em batch
  const mediaMap = new Map<string, { id: string; type: string; thumbnail: string | null; mimeType: string }>()
  if (mediaNotifs.length > 0) {
    for (const n of mediaNotifs) {
      const nearby = await db.mediaEvent.findFirst({
        where: {
          deviceId: n.deviceId,
          timestamp: {
            gte: new Date(n.timestamp.getTime() - MEDIA_WINDOW_MS),
            lte: new Date(n.timestamp.getTime() + MEDIA_WINDOW_MS),
          },
        },
        orderBy: { timestamp: 'desc' },
        select: { id: true, type: true, thumbnail: true, mimeType: true },
      })
      if (nearby) {
        mediaMap.set(n.id, nearby)
      }
    }
  }

  const dtos = events.map(e => {
    const linked = mediaMap.get(e.id)
    return {
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
      audioBase64: e.audioBase64,
      flagged: e.flagged,
      flagReason: e.flagReason,
      severity: e.severity,
      timestamp: e.timestamp.toISOString(),
      linkedMediaId: linked?.id ?? null,
      linkedMediaType: linked?.type ?? null,
      linkedMediaThumb: linked?.thumbnail ?? null,
      linkedMediaMime: linked?.mimeType ?? null,
    }
  })

  return json({
    events: dtos,
    devices: devices.map(d => ({ id: d.id, name: d.name, childName: d.child?.name ?? null })),
  })
}
