import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, createSession } from '@/lib/auth'
import { auditLog, errorResponse, json, parseJsonBody, getUserMeta } from '@/lib/api-helpers'

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
})

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const firstErr = parsed.error.issues[0]
    return errorResponse(firstErr.message, 400)
  }
  const { email, password, name } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return errorResponse('EMAIL_TAKEN', 409)
  }

  const passwordHash = await hashPassword(password)
  const user = await db.user.create({
    data: { email, passwordHash, name, role: 'parent', onboardingStep: 1 },
  })

  const meta = getUserMeta(req)
  await createSession(user.id, meta)
  await auditLog(user.id, 'register', user.id, { email }, req)
  await auditLog(user.id, 'login', null, { via: 'register' }, req)

  return json({
    user: { id: user.id, email: user.email, name: user.name, jurisdiction: user.jurisdiction, locale: user.locale, onboardingStep: user.onboardingStep },
  })
}
