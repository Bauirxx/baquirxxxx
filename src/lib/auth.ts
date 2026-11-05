// GuardianLink — Auth helpers (cookie session + bcrypt)
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { db } from './db'

export const SESSION_COOKIE = 'gl_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 dias

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

export async function createSession(userId: string, meta?: { ip?: string; ua?: string }) {
  const token = generateToken(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const session = await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress: meta?.ip ?? null,
      userAgent: meta?.ua ?? null,
    },
  })
  const cookieStore = await cookies()
  // SameSite=None + Secure para o cookie funcionar dentro de iframes cross-site
  // (preview URLs carregadas em iframes em IMs como o chat.z.ai exigem None+Secure).
  // Localhost é tratado como "secure context" pelo navegador, então Secure funciona em dev também.
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    expires: expiresAt,
  })
  return session
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {})
  }
  cookieStore.delete(SESSION_COOKIE)
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  return session.user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return user
}

export function getClientIp(req: Request): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip') ?? undefined
}

export function getUserAgent(req: Request): string | undefined {
  return req.headers.get('user-agent') ?? undefined
}
