// GuardianLink — Helpers compartilhados por todas as APIs
import { NextResponse } from 'next/server'
import { getCurrentUser, getClientIp, getUserAgent } from './auth'
import { db } from './db'

export type ApiUser = Awaited<ReturnType<typeof getCurrentUser>>

export async function getUserOr401() {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
    }
  }
  return { user, response: null }
}

export async function auditLog(
  userId: string,
  action: string,
  target?: string | null,
  metadata?: Record<string, unknown>,
  req?: Request
) {
  const ip = req ? getClientIp(req) : null
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        target: target ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: ip ?? null,
      },
    })
  } catch (err) {
    console.error('auditLog failed:', err)
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function errorResponse(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code: code ?? message.toUpperCase() }, { status })
}

export async function parseJsonBody(req: Request): Promise<any | null> {
  try {
    const text = await req.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function getUserMeta(req: Request) {
  return {
    ip: getClientIp(req),
    ua: getUserAgent(req),
  }
}
