import { NextRequest } from 'next/server'
import { getCurrentUser, destroySession } from '@/lib/auth'
import { auditLog, json } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (user) {
    await auditLog(user.id, 'logout', null, {}, req)
  }
  await destroySession()
  return json({ ok: true })
}
