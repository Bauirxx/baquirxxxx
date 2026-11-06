import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, errorResponse } from '@/lib/api-helpers'
import { readFile } from 'fs/promises'

export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return errorResponse('id required', 400)

  const media = await db.mediaEvent.findUnique({ where: { id } })
  if (!media) return errorResponse('NOT_FOUND', 404)

  const device = await db.device.findUnique({ where: { id: media.deviceId } })
  if (!device || device.userId !== user.id) return errorResponse('NOT_FOUND', 404)

  try {
    const buffer = await readFile(media.storagePath)
    return new Response(buffer, {
      headers: {
        'Content-Type': media.mimeType,
        'Content-Disposition': `inline; filename="${media.fileName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return errorResponse('File not found on disk', 404)
  }
}
