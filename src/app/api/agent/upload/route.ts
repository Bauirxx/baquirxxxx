import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, errorResponse, auditLog } from '@/lib/api-helpers'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import sharp from 'sharp'

const STORAGE_ROOT = join(process.cwd(), 'storage')

async function makeThumbnail(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (!mimeType.startsWith('image/')) return null
  try {
    const thumb = await sharp(buffer)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 60 })
      .toBuffer()
    return 'data:image/jpeg;base64,' + thumb.toString('base64')
  } catch {
    return null
  }
}

async function authenticateAgent(req: NextRequest) {
  const token = req.headers.get('x-agent-token')
  if (!token) return null

  const device = await db.device.findFirst({
    where: { agentToken: token, status: { in: ['active', 'pending'] } },
    include: { user: true },
  })
  if (device) return { device, user: device.user }

  const session = await db.session.findUnique({ where: { token }, include: { user: true } })
  if (session && session.expiresAt > new Date()) {
    const dev = await db.device.findFirst({
      where: { userId: session.userId, status: { not: 'revoked' } },
      orderBy: { registeredAt: 'desc' },
      include: { user: true },
    })
    if (dev) return { device: dev, user: session.user }
  }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth) return errorResponse('UNAUTHORIZED_AGENT', 401)

  const { device, user } = auth

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorResponse('multipart form expected', 400)
  }

  const file = formData.get('file') as File | null
  if (!file || !file.name) return errorResponse('file required', 400)

  const type = String(formData.get('type') || 'photo')
  const source = String(formData.get('source') || 'gallery')
  const timestampMs = Number(formData.get('timestamp') || Date.now())
  const timestamp = new Date(timestampMs)

  const dir = join(STORAGE_ROOT, device.id, type)
  await mkdir(dir, { recursive: true })

  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
  const uniqueName = randomBytes(8).toString('hex') + ext
  const storagePath = join(dir, uniqueName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(storagePath, buffer)

  const thumbnail = await makeThumbnail(buffer, file.type || '')

  const saved = await db.mediaEvent.create({
    data: {
      deviceId: device.id,
      type,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: buffer.length,
      storagePath,
      thumbnail,
      source,
      timestamp,
    },
  })

  await auditLog(user.id, 'media_uploaded', device.id, {
    mediaId: saved.id,
    type,
    fileName: file.name,
    sizeBytes: buffer.length,
  }, req)

  return json({ ok: true, id: saved.id })
}
