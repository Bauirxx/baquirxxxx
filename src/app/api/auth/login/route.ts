import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { auditLog, errorResponse, json, parseJsonBody, getUserMeta } from '@/lib/api-helpers'
import { pushDebug } from '@/lib/debug-log'

// Aceita `email` OU `username` (a app Companion envia `username`); ambos são o email da conta.
const schema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return errorResponse('INVALID_CREDENTIALS', 400)
  }
  const email = (parsed.data.email ?? parsed.data.username ?? '').trim().toLowerCase()
  const { password } = parsed.data
  if (!email) return errorResponse('INVALID_CREDENTIALS', 400)

  const user = await db.user.findUnique({ where: { email } })
  const ok = user ? await verifyPassword(password, user.passwordHash) : false
  pushDebug('login', {
    email,
    userFound: !!user,
    passwordLen: password?.length ?? 0,
    passwordMatch: ok,
    ua: req.headers.get('user-agent') ?? '',
    resultado: user && ok ? 'OK 200' : 'FALHOU 401',
  })
  if (!user || !ok) return errorResponse('INVALID_CREDENTIALS', 401)

  const meta = getUserMeta(req)
  const session = await createSession(user.id, meta)
  await auditLog(user.id, 'login', null, { via: 'signin' }, req)

  // `token` no corpo serve a app Companion (envia-o como X-Agent-Token no ingest);
  // o painel web continua a usar o cookie de sessão.
  return json({
    token: session.token,
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
