import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { auditLog, errorResponse, json, parseJsonBody, getUserMeta } from '@/lib/api-helpers'

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return errorResponse('INVALID_CREDENTIALS', 400)
  }
  const { email, password } = parsed.data

  const user = await db.user.findUnique({ where: { email } })
  if (!user) return errorResponse('INVALID_CREDENTIALS', 401)
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return errorResponse('INVALID_CREDENTIALS', 401)

  const meta = getUserMeta(req)
  await createSession(user.id, meta)
  await auditLog(user.id, 'login', null, { via: 'signin' }, req)

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      jurisdiction: user.jurisdiction,
      locale: user.locale,
      onboardingStep: user.onboardingStep,
    },
  })
}
