import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserOr401, json, errorResponse, auditLog, parseJsonBody } from '@/lib/api-helpers'

const schema = z.object({
  sessionId: z.string(),
})

// POST — para uma sessão de espelhamento
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)

  const { sessionId } = parsed.data
  const session = await db.screenSession.findUnique({ where: { id: sessionId } })
  if (!session || session.userId !== user.id) return errorResponse('SESSION_NOT_FOUND', 404)

  await db.screenSession.update({
    where: { id: sessionId },
    data: { status: 'ended', endedAt: new Date() },
  })

  await auditLog(user.id, 'screen_session_stopped', sessionId, {}, req)
  return json({ ok: true })
}
