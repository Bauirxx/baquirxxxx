import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, errorResponse, parseJsonBody, auditLog } from '@/lib/api-helpers'
import { broadcastEvent } from '@/lib/realtime-broadcast'

// Auth via X-Agent-Token header (enviado pelo app Android após ativação)
async function authenticateAgent(req: NextRequest): Promise<{ device: any; user: any } | null> {
  const token = req.headers.get('x-agent-token')
  if (token) {
    const device = await db.device.findFirst({
      where: { agentToken: token, status: { in: ['active', 'pending'] } },
      include: { user: true },
    })
    if (device) return { device, user: device.user }
  }
  // Alternativa: installCode (quando o agente ainda não foi ativado)
  const installCode = req.headers.get('x-install-code')
  if (installCode) {
    const device = await db.device.findFirst({
      where: { installCode, status: { not: 'revoked' } },
      include: { user: true },
    })
    if (device) return { device, user: device.user }
  }
  return null
}

// POST /api/agent/ingest
// Body: { events: [{ type: 'location'|'call'|'sms'|'app'|'browser'|'alert'|'sos', payload: {...} }] }
export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth) return errorResponse('UNAUTHORIZED_AGENT', 401)

  const { device, user } = auth
  const body = await parseJsonBody(req)
  if (!body || !Array.isArray(body.events)) return errorResponse('events[] required', 400)

  // Marca dispositivo como ativo + lastSeen
  await db.device.update({
    where: { id: device.id },
    data: { status: 'active', lastSeenAt: new Date() },
  })

  const acks: any[] = []

  for (const evt of body.events.slice(0, 200)) {
    const { type, payload } = evt
    if (!type || !payload) continue
    const ts = payload.timestamp ? new Date(payload.timestamp) : new Date()
    let saved: any = null

    if (type === 'location') {
      saved = await db.locationEvent.create({
        data: {
          deviceId: device.id,
          latitude: Number(payload.latitude),
          longitude: Number(payload.longitude),
          accuracy: payload.accuracy ? Number(payload.accuracy) : null,
          speed: payload.speed != null ? Number(payload.speed) : null,
          altitude: payload.altitude != null ? Number(payload.altitude) : null,
          bearing: payload.bearing != null ? Number(payload.bearing) : null,
          battery: payload.battery != null ? Number(payload.battery) : null,
          timestamp: ts,
        },
      })
    } else if (type === 'call') {
      saved = await db.callEvent.create({
        data: {
          deviceId: device.id,
          phoneNumber: String(payload.phoneNumber ?? ''),
          contactName: payload.contactName ?? null,
          direction: ['incoming', 'outgoing', 'missed'].includes(payload.direction)
            ? payload.direction : 'incoming',
          duration: Number(payload.duration ?? 0),
          timestamp: ts,
        },
      })
    } else if (type === 'sms') {
      saved = await db.smsEvent.create({
        data: {
          deviceId: device.id,
          phoneNumber: String(payload.phoneNumber ?? ''),
          contactName: payload.contactName ?? null,
          direction: ['incoming', 'outgoing'].includes(payload.direction)
            ? payload.direction : 'incoming',
          body: String(payload.body ?? ''),
          flagged: Boolean(payload.flagged),
          flagReason: payload.flagReason ?? null,
          timestamp: ts,
        },
      })
    } else if (type === 'app') {
      saved = await db.appUsageEvent.create({
        data: {
          deviceId: device.id,
          packageName: String(payload.packageName ?? ''),
          appName: String(payload.appName ?? payload.packageName ?? ''),
          foregroundMs: Number(payload.foregroundMs ?? 0),
          dataUsageBytes: payload.dataUsageBytes != null ? Number(payload.dataUsageBytes) : null,
          timestamp: ts,
        },
      })
    } else if (type === 'installed_apps') {
      // Agente Android reporta lista completa de apps instaladas.
      // Faz upsert: cria se não existe, atualiza se existe (versão, etc).
      const appsList = Array.isArray(payload.apps) ? payload.apps : []
      let upserted = 0
      for (const a of appsList.slice(0, 500)) { // limite de 500 apps por batch
        const packageName = String(a.packageName ?? '')
        if (!packageName) continue
        await db.installedApp.upsert({
          where: { deviceId_packageName: { deviceId: device.id, packageName } },
          create: {
            deviceId: device.id,
            packageName,
            appName: String(a.appName ?? packageName),
            versionName: a.versionName ? String(a.versionName) : null,
            versionCode: a.versionCode != null ? Number(a.versionCode) : null,
            systemApp: Boolean(a.systemApp ?? false),
          },
          update: {
            appName: String(a.appName ?? packageName),
            versionName: a.versionName ? String(a.versionName) : null,
            versionCode: a.versionCode != null ? Number(a.versionCode) : null,
            systemApp: Boolean(a.systemApp ?? false),
            updatedAt: new Date(),
          },
        }).catch(() => {})
        upserted++
      }
      saved = { id: `batch-${upserted}`, type: 'installed_apps', count: upserted }
    } else if (type === 'browser') {
      saved = await db.browserEvent.create({
        data: {
          deviceId: device.id,
          url: String(payload.url ?? ''),
          title: payload.title ?? null,
          category: payload.category ?? null,
          blocked: Boolean(payload.blocked),
          timestamp: ts,
        },
      })
    } else if (type === 'alert') {
      saved = await db.socialAlert.create({
        data: {
          deviceId: device.id,
          platform: String(payload.platform ?? 'whatsapp'),
          severity: ['low', 'medium', 'high', 'critical'].includes(payload.severity)
            ? payload.severity : 'medium',
          category: String(payload.category ?? 'cyberbullying'),
          snippet: String(payload.snippet ?? ''),
          actionTaken: payload.actionTaken ?? null,
          resolved: false,
          timestamp: ts,
        },
      })
    } else if (type === 'sos') {
      saved = await db.sosEvent.create({
        data: {
          deviceId: device.id,
          latitude: payload.latitude != null ? Number(payload.latitude) : null,
          longitude: payload.longitude != null ? Number(payload.longitude) : null,
          accuracy: payload.accuracy != null ? Number(payload.accuracy) : null,
          battery: payload.battery != null ? Number(payload.battery) : null,
          trigger: String(payload.trigger ?? 'button'),
          resolved: false,
          timestamp: ts,
        },
      })
    }

    if (saved) {
      acks.push({ type, id: saved.id })
      // Broadcast em tempo real (best-effort)
      broadcastEvent({
        userId: user.id,
        deviceId: device.id,
        event: { type, ...payload, id: saved.id, timestamp: ts.toISOString() },
      })
    }
  }

  // Audit log levemente (1 entrada por batch)
  await auditLog(user.id, 'agent_ingest', device.id, { count: acks.length, types: acks.map(a => a.type) }, req)

  return json({ ok: true, ingested: acks.length, acks })
}
