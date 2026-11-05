import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser, generateToken } from '@/lib/auth'
import { auditLog, errorResponse, json, parseJsonBody, getUserOr401, getUserMeta } from '@/lib/api-helpers'
import { legalVersionFor, LEGAL_SNIPPETS } from '@/lib/constants'
import type { Jurisdiction } from '@/lib/types'

const bodySchema = z.object({
  step: z.union([z.literal('jurisdiction'), z.literal('consent'), z.literal('child'), z.literal('device'), z.literal('finish')]),
  // step=jurisdiction
  jurisdiction: z.enum(['BR', 'EU', 'US']).optional(),
  // step=consent
  consent: z.object({
    parent: z.boolean(),
    inform: z.boolean(),
    terms: z.boolean(),
  }).optional(),
  // step=child
  child: z.object({
    name: z.string().min(1).max(80),
    birthDate: z.string(),
  }).optional(),
  // step=device
  device: z.object({
    name: z.string().min(1).max(80),
    model: z.string().optional(),
    osVersion: z.string().optional(),
  }).optional(),
})

export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400)
  const { step } = parsed.data
  const meta = getUserMeta(req)

  if (step === 'jurisdiction') {
    const jurisdiction = parsed.data.jurisdiction as Jurisdiction | undefined
    if (!jurisdiction) return errorResponse('jurisdiction required', 400)
    await db.user.update({
      where: { id: user.id },
      data: { jurisdiction, onboardingStep: 2 },
    })
    await auditLog(user.id, 'onboarding_step', null, { step: 'jurisdiction', jurisdiction }, req)
    return json({ ok: true, nextStep: 'consent' })
  }

  if (step === 'consent') {
    const consent = parsed.data.consent
    if (!consent || !consent.parent || !consent.inform || !consent.terms) {
      return errorResponse('ALL_CONSENT_REQUIRED', 400)
    }
    const legalVersion = legalVersionFor(user.jurisdiction as Jurisdiction)
    const snippet = LEGAL_SNIPPETS[user.jurisdiction as Jurisdiction][user.locale as 'pt-BR' | 'en']
    // Cria 3 registros auditáveis (parent, inform, terms)
    for (const [type, accepted] of [
      ['parent', consent.parent],
      ['inform', consent.inform],
      ['terms', consent.terms],
    ] as const) {
      await db.consentRecord.create({
        data: {
          userId: user.id,
          consentType: type,
          jurisdiction: user.jurisdiction,
          legalVersion,
          accepted,
          ipAddress: meta.ip ?? null,
          userAgent: meta.ua ?? null,
          signedText: snippet.slice(0, 4000),
        },
      })
    }
    await db.user.update({
      where: { id: user.id },
      data: { onboardingStep: 3 },
    })
    await auditLog(user.id, 'consent_signed', null, { legalVersion, jurisdiction: user.jurisdiction }, req)
    return json({ ok: true, nextStep: 'child' })
  }

  if (step === 'child') {
    const child = parsed.data.child
    if (!child) return errorResponse('child required', 400)
    const birthDate = new Date(child.birthDate)
    if (isNaN(birthDate.getTime())) return errorResponse('invalid birthDate', 400)
    if (birthDate > new Date()) return errorResponse('birthDate in future', 400)
    await db.child.create({
      data: {
        userId: user.id,
        name: child.name,
        birthDate,
      },
    })
    await db.user.update({
      where: { id: user.id },
      data: { onboardingStep: 4 },
    })
    await auditLog(user.id, 'onboarding_step', null, { step: 'child', name: child.name }, req)
    return json({ ok: true, nextStep: 'device' })
  }

  if (step === 'device') {
    const device = parsed.data.device
    if (!device) return errorResponse('device required', 400)
    // Procura primeira criança cadastrada neste onboarding
    const child = await db.child.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    if (!child) return errorResponse('NO_CHILD_REGISTERED', 400)
    // Gera código curto de 6 dígitos e token de agente
    const installCode = Math.random().toString().slice(2, 8)
    const agentToken = generateToken(32)
    const newDevice = await db.device.create({
      data: {
        childId: child.id,
        userId: user.id,
        name: device.name,
        model: device.model ?? 'Unknown',
        osVersion: device.osVersion ?? 'Android',
        installCode,
        agentToken,
        status: 'pending',
      },
    })
    await db.user.update({
      where: { id: user.id },
      data: { onboardingStep: 5 },
    })
    await auditLog(user.id, 'device_registered', newDevice.id, { installCode }, req)
    return json({
      ok: true,
      nextStep: 'finish',
      device: {
        id: newDevice.id,
        name: newDevice.name,
        installCode: newDevice.installCode,
        status: newDevice.status,
      },
    })
  }

  if (step === 'finish') {
    await db.user.update({
      where: { id: user.id },
      data: { onboardingStep: 5 },
    })
    return json({ ok: true })
  }

  return errorResponse('unknown step', 400)
}

// GET — busca estado atual do onboarding (para retomar)
export async function GET(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response
  const child = await db.child.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
  const device = await db.device.findFirst({
    where: { userId: user.id },
    orderBy: { registeredAt: 'desc' },
    include: { child: true },
  })
  return json({
    onboardingStep: user.onboardingStep,
    jurisdiction: user.jurisdiction,
    child: child ? { id: child.id, name: child.name, birthDate: child.birthDate.toISOString() } : null,
    device: device
      ? { id: device.id, name: device.name, installCode: device.installCode, status: device.status, childName: device.child.name }
      : null,
  })
}
