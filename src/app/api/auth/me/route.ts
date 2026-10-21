import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { json, errorResponse } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return errorResponse('UNAUTHENTICATED', 401)
  const deviceCount = await db.device.count({ where: { userId: user.id } })
  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      jurisdiction: user.jurisdiction,
      locale: user.locale,
      onboardingStep: user.onboardingStep,
      role: user.role,
    },
    hasDevices: deviceCount > 0,
  })
}
