import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, errorResponse, auditLog } from '@/lib/api-helpers'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

// POST /api/agent/upload — multipart upload de foto/vídeo/áudio do Android
// Auth via X-Agent-Token header (igual ao ingest)
// Body: multipart/form-data com:
//   - file: o ficheiro binário
//   - type: "photo" | "video" | "audio"
//   - timestamp: epoch ms
//   - source: "gallery" | "whatsapp" | "instagram" | "camera" | "download" (opcional)
//   - thumbnail: base64 JPEG thumbnail (opcional, para gallery rápida)
export async function POST(req: NextRequest) {
  // Auth
  const token = req.headers.get('x-agent-token')
  const installCode = req.headers.get('x-install-code')
  if (!token && !installCode) return errorResponse('UNAUTHORIZED_AGENT', 401)

  const device = token
    ? await db.device.findFirst({ where: { agentToken: token, status: { not: 'revoked' } } })
    : await db.device.findFirst({ where: { installCode: installCode!, status: { not: 'revoked' } } })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)

  // Verifica consentimento em tempo real
  if (!device.consentGiven) {
    return errorResponse('CONSENT_REQUIRED', 403)
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string
  const timestampStr = formData.get('timestamp') as string
  const source = (formData.get('source') as string) || null
  const thumbnail = (formData.get('thumbnail') as string) || null

  if (!file || !type) return errorResponse('file and type required', 400)
  if (!['photo', 'video', 'audio'].includes(type)) return errorResponse('invalid type', 400)

  // Limitar tamanho (50MB para vídeos, 10MB para fotos, 5MB para áudio)
  const maxSizes: Record<string, number> = { photo: 10_000_000, video: 50_000_000, audio: 5_000_000 }
  if (file.size > maxSizes[type]) return errorResponse('FILE_TOO_LARGE', 413)

  // Organizar storage por dispositivo: /storage/{deviceId}/{type}/
  const storageDir = path.join(process.cwd(), 'storage', device.id, type)
  await mkdir(storageDir, { recursive: true })

  // Nome único: {timestamp}-{hash}.{ext}
  const ext = file.name.split('.').pop() || 'bin'
  const hash = crypto.randomBytes(8).toString('hex')
  const fileName = `${timestampStr || Date.now()}-${hash}.${ext}`
  const filePath = path.join(storageDir, fileName)

  // Escrever ficheiro
  const bytes = await file.arrayBuffer()
  await writeFile(filePath, Buffer.from(bytes))

  const storagePath = `/storage/${device.id}/${type}/${fileName}`
  const ts = timestampStr ? new Date(parseInt(timestampStr)) : new Date()

  const media = await db.mediaEvent.create({
    data: {
      deviceId: device.id,
      type,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      storagePath,
      thumbnail,
      source,
      timestamp: ts,
    },
  })

  await auditLog(device.userId, 'media_uploaded', media.id, { type, fileName, sizeBytes: file.size }, req)

  return json({ ok: true, mediaId: media.id, storagePath })
}
