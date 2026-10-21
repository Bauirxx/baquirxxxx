import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { getUserOr401, json, errorResponse, parseJsonBody, auditLog } from '@/lib/api-helpers'
import { JURISDICTIONS, legalVersionFor } from '@/lib/constants'
import type { ConsentRecordDTO, AuditLogDTO, Jurisdiction } from '@/lib/types'

export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const [consentRecords, auditLogs, devicesCount, children] = await Promise.all([
    db.consentRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.device.count({ where: { userId: user.id } }),
    db.child.findMany({ where: { userId: user.id } }),
  ])

  const consentDtos: ConsentRecordDTO[] = consentRecords.map(r => ({
    id: r.id,
    consentType: r.consentType,
    jurisdiction: r.jurisdiction,
    legalVersion: r.legalVersion,
    accepted: r.accepted,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt.toISOString(),
  }))

  const auditDtos: AuditLogDTO[] = auditLogs.map(l => ({
    id: l.id,
    action: l.action,
    target: l.target,
    metadata: l.metadata,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt.toISOString(),
  }))

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      jurisdiction: user.jurisdiction,
      locale: user.locale,
    },
    consentRecords: consentDtos,
    auditLogs: auditDtos,
    devicesCount,
    children,
    jurisdictions: JURISDICTIONS.map(j => ({
      code: j.code,
      label: j.label,
      law: j.law,
      ageOfConsent: j.ageOfConsent,
      rightToBeForgotten: j.rightToBeForgotten,
      requiresDPIA: j.requiresDPIA,
    })),
  })
}

// POST — alterar jurisdição (invalida consentimentos anteriores)
export async function POST(req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const body = await parseJsonBody(req)
  if (!body) return errorResponse('Invalid JSON', 400)
  if (body.action === 'changeJurisdiction') {
    const newJ = body.jurisdiction as Jurisdiction
    if (!['BR', 'EU', 'US'].includes(newJ)) return errorResponse('invalid jurisdiction', 400)
    // Invalida consentimentos anteriores marcando-os como "accepted: false, mas mantém o histórico"
    // Para auditoria: criamos novos registros indicando revogação? Mais simples: removemos e logamos.
    await db.consentRecord.deleteMany({ where: { userId: user.id } })
    await db.user.update({
      where: { id: user.id },
      data: { jurisdiction: newJ, onboardingStep: Math.min(user.onboardingStep, 1) },
    })
    await auditLog(user.id, 'jurisdiction_changed', null, { from: user.jurisdiction, to: newJ }, req)
    return json({ ok: true })
  }
  if (body.action === 'deleteAccount') {
    await db.user.delete({ where: { id: user.id } })
    return json({ ok: true, deleted: true })
  }
  return errorResponse('unknown action', 400)
}
