import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, errorResponse, parseJsonBody } from '@/lib/api-helpers'
import { broadcastEvent } from '@/lib/realtime-broadcast'
import { COMMON_ANDROID_APPS } from '@/lib/constants'

// POST /api/dev/inject-mock
// Body: { installCode: string, events?: number, extras?: ['installedApps', 'syncEvents', 'screenSession'] }
// Insere eventos sintéticos no dispositivo identificado pelo installCode
// ATENÇÃO: deve ser removido em produção.
export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req)
  if (!body || !body.installCode) return errorResponse('installCode required', 400)

  const device = await db.device.findFirst({
    where: { installCode: body.installCode, status: { not: 'revoked' } },
    include: { user: true, child: true },
  })
  if (!device) return errorResponse('DEVICE_NOT_FOUND', 404)

  // Ativa o dispositivo
  await db.device.update({
    where: { id: device.id },
    data: { status: 'active', lastSeenAt: new Date(), agentToken: device.agentToken ?? crypto.randomUUID() },
  })

  const eventCount = Math.min(Number(body.events ?? 6), 20)
  const now = new Date()
  const acks: any[] = []

  // Base: São Paulo, Brasil (-23.5505, -46.6333) — usuários podem mudar se quiserem
  // Pequena variação aleatória para mostrar "movimento"
  let lat = -23.5505 + (Math.random() - 0.5) * 0.02
  let lng = -46.6333 + (Math.random() - 0.5) * 0.02

  const phoneNumbers = ['+55 11 99999-1234', '+55 11 98888-5678', '+55 21 97777-4321', 'Unknown']
  const contacts = ['Vovó', 'Tio João', 'Escola', null, 'Pedrinho']
  const apps = [
    { packageName: 'com.whatsapp', appName: 'WhatsApp', foregroundMs: 0 },
    { packageName: 'com.instagram.android', appName: 'Instagram', foregroundMs: 0 },
    { packageName: 'com.zhiliaoapp.musically', appName: 'TikTok', foregroundMs: 0 },
    { packageName: 'com.android.chrome', appName: 'Chrome', foregroundMs: 0 },
    { packageName: 'com.google.android.youtube', appName: 'YouTube', foregroundMs: 0 },
  ]
  const urls = [
    { url: 'https://www.wikipedia.org/', title: 'Wikipedia', category: 'education', blocked: false },
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'YouTube', category: 'games', blocked: false },
    { url: 'https://www.adultcontent-example.com/', title: 'Adult', category: 'adult', blocked: true },
    { url: 'https://www.instagram.com/', title: 'Instagram', category: 'social', blocked: false },
  ]
  const alertSnippets = [
    { platform: 'whatsapp', severity: 'high', category: 'cyberbullying', snippet: '[redigido]: mensagem contendo insultos e ameaças dirigidas ao usuário' },
    { platform: 'instagram', severity: 'medium', category: 'drugs', snippet: '[redigido]: menção a substâncias controladas em publicação' },
    { platform: 'tiktok', severity: 'low', category: 'self_harm', snippet: '[redigido]: possível referência a automutilação em comentário' },
    { platform: 'whatsapp', severity: 'critical', category: 'predator', snippet: '[redigido]: contato adulto desconhecido solicitando encontro' },
  ]
  const smsSamples = [
    { phoneNumber: '+55 11 99999-1234', direction: 'incoming', body: 'oi, vou chegar às 18h', flagged: false },
    { phoneNumber: '+55 11 99999-1234', direction: 'outgoing', body: 'tá bom, te espero', flagged: false },
    { phoneNumber: 'Unknown', direction: 'incoming', body: 'PARABÉNS! Você ganhou R$ 5.000. Clique agora', flagged: true, flagReason: 'phishing' },
  ]
  const syncCommands = ['touch', 'key', 'text', 'back', 'home', 'volume_up', 'volume_down'] as const

  for (let i = 0; i < eventCount; i++) {
    const eventType = ['location', 'call', 'sms', 'app', 'browser', 'alert', 'sos'][Math.floor(Math.random() * 7)]
    const ts = new Date(now.getTime() - i * 90_000) // eventos espaçados em 90s
    let saved: any = null
    const payload: any = { timestamp: ts.toISOString() }

    if (eventType === 'location') {
      lat += (Math.random() - 0.5) * 0.0015
      lng += (Math.random() - 0.5) * 0.0015
      payload.latitude = lat
      payload.longitude = lng
      payload.accuracy = 8 + Math.random() * 12
      payload.speed = Math.random() * 1.5
      payload.battery = Math.floor(40 + Math.random() * 60)
      saved = await db.locationEvent.create({
        data: {
          deviceId: device.id,
          latitude: lat,
          longitude: lng,
          accuracy: payload.accuracy,
          speed: payload.speed,
          battery: payload.battery,
          timestamp: ts,
        },
      })
    } else if (eventType === 'call') {
      const n = Math.floor(Math.random() * phoneNumbers.length)
      const directions = ['incoming', 'outgoing', 'missed'] as const
      payload.phoneNumber = phoneNumbers[n]
      payload.contactName = contacts[n]
      payload.direction = directions[Math.floor(Math.random() * 3)]
      payload.duration = payload.direction === 'missed' ? 0 : Math.floor(5 + Math.random() * 600)
      saved = await db.callEvent.create({
        data: {
          deviceId: device.id,
          phoneNumber: payload.phoneNumber,
          contactName: payload.contactName,
          direction: payload.direction,
          duration: payload.duration,
          timestamp: ts,
        },
      })
    } else if (eventType === 'sms') {
      const s = smsSamples[Math.floor(Math.random() * smsSamples.length)]
      payload.phoneNumber = s.phoneNumber
      payload.direction = s.direction
      payload.body = s.body
      payload.flagged = s.flagged
      payload.flagReason = s.flagReason
      saved = await db.smsEvent.create({
        data: {
          deviceId: device.id,
          phoneNumber: s.phoneNumber,
          direction: s.direction,
          body: s.body,
          flagged: s.flagged,
          flagReason: s.flagReason ?? null,
          timestamp: ts,
        },
      })
    } else if (eventType === 'app') {
      const app = apps[Math.floor(Math.random() * apps.length)]
      const fg = Math.floor(60_000 + Math.random() * 1_800_000) // 1min a 30min
      payload.packageName = app.packageName
      payload.appName = app.appName
      payload.foregroundMs = fg
      payload.dataUsageBytes = Math.floor(Math.random() * 50_000_000)
      saved = await db.appUsageEvent.create({
        data: {
          deviceId: device.id,
          packageName: app.packageName,
          appName: app.appName,
          foregroundMs: fg,
          dataUsageBytes: payload.dataUsageBytes,
          timestamp: ts,
        },
      })
    } else if (eventType === 'browser') {
      const u = urls[Math.floor(Math.random() * urls.length)]
      payload.url = u.url
      payload.title = u.title
      payload.category = u.category
      payload.blocked = u.blocked
      saved = await db.browserEvent.create({
        data: {
          deviceId: device.id,
          url: u.url,
          title: u.title,
          category: u.category,
          blocked: u.blocked,
          timestamp: ts,
        },
      })
    } else if (eventType === 'alert') {
      const a = alertSnippets[Math.floor(Math.random() * alertSnippets.length)]
      payload.platform = a.platform
      payload.severity = a.severity
      payload.category = a.category
      payload.snippet = a.snippet
      saved = await db.socialAlert.create({
        data: {
          deviceId: device.id,
          platform: a.platform,
          severity: a.severity,
          category: a.category,
          snippet: a.snippet,
          timestamp: ts,
        },
      })
    } else if (eventType === 'sos') {
      payload.latitude = lat
      payload.longitude = lng
      payload.battery = Math.floor(20 + Math.random() * 80)
      payload.trigger = ['button', 'keyword', 'fall_detection'][Math.floor(Math.random() * 3)]
      saved = await db.sosEvent.create({
        data: {
          deviceId: device.id,
          latitude: lat,
          longitude: lng,
          battery: payload.battery,
          trigger: payload.trigger,
          timestamp: ts,
        },
      })
    }

    if (saved) {
      acks.push({ type: eventType, id: saved.id })
      broadcastEvent({
        userId: device.user.id,
        deviceId: device.id,
        event: { type: eventType, ...payload, id: saved.id },
      })
    }
  }

  // Extras opcionais — instaladas por defeito se a app ainda não as tem
  const extras = body.extras ?? ['installedApps', 'syncEvents', 'screenSession']

  // 1) Apps instaladas (se ainda não houver)
  let installedAppsCount = 0
  if (extras.includes('installedApps')) {
    const existing = await db.installedApp.count({ where: { deviceId: device.id } })
    if (existing === 0) {
      const subset = COMMON_ANDROID_APPS
        .sort(() => Math.random() - 0.5)
        .slice(0, 10 + Math.floor(Math.random() * 6))
      // SQLite não suporta skipDuplicates em createMany — usamos insert individual com upsert pattern
      for (const a of subset) {
        try {
          await db.installedApp.create({
            data: {
              deviceId: device.id,
              packageName: a.packageName,
              appName: a.appName,
              versionName: `1.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 99)}`,
              versionCode: 10000 + Math.floor(Math.random() * 99999),
              systemApp: a.systemApp,
            },
          })
        } catch {
          // ignore unique constraint violations
        }
      }
      installedAppsCount = subset.length
    } else {
      installedAppsCount = existing
    }
  }

  // 2) Screen session ativa (se ainda não houver)
  let screenSessionCreated = false
  if (extras.includes('screenSession')) {
    const activeCount = await db.screenSession.count({
      where: { deviceId: device.id, status: 'active' },
    })
    if (activeCount === 0) {
      await db.screenSession.create({
        data: {
          deviceId: device.id,
          userId: device.user.id,
          codec: 'H264',
          fps: 30,
          bitrate: 2_000_000,
          width: device.screenW,
          height: device.screenH,
          status: 'active',
          framesReceived: 1000 + Math.floor(Math.random() * 9999),
          bytesReceived: 5_000_000 + Math.floor(Math.random() * 50_000_000),
        },
      })
      screenSessionCreated = true
    }
  }

  // 3) Sync events (cria 1-3 para popular métricas)
  let syncEventsCreated = 0
  if (extras.includes('syncEvents')) {
    // Busca config do user (cria default se não existir)
    let syncConfig = await db.syncConfig.findUnique({ where: { userId: device.user.id } })
    if (!syncConfig) {
      syncConfig = await db.syncConfig.create({ data: { userId: device.user.id } })
    }
    const syncCount = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < syncCount; i++) {
      const cmd = syncCommands[Math.floor(Math.random() * syncCommands.length)]
      const targetDevices = await db.device.findMany({
        where: { userId: device.user.id, status: { not: 'revoked' }, id: { not: device.id } },
        select: { id: true, name: true },
      })
      // Se há outros aparelhos, usa-os; senão, simula com 1 alvo fictício
      const targets = (targetDevices.length > 0 ? targetDevices : [{ id: device.id, name: device.name }]).map(d => {
        const deviation = 30 + Math.random() * 100
        const success = Math.random() > 0.1
        return {
          deviceId: d.id,
          deviceName: d.name,
          success,
          deviationMs: Math.round(deviation * 10) / 10,
          error: success ? undefined : 'timeout',
        }
      })
      const successCount = targets.filter(t => t.success).length
      const failCount = targets.length - successCount
      const deviations = targets.map(t => t.deviationMs)
      const avgDeviation = deviations.reduce((s, d) => s + d, 0) / Math.max(1, deviations.length)
      const maxDeviation = Math.max(...deviations, 0)
      const ts = new Date(now.getTime() - i * 60000 - Math.random() * 60000)
      await db.syncEvent.create({
        data: {
          userId: device.user.id,
          commandType: cmd,
          mode: syncConfig.mode,
          targetsJson: JSON.stringify(targets),
          successCount,
          failCount,
          avgDeviation,
          maxDeviation,
          timestamp: ts,
        },
      })
      syncEventsCreated++
    }
  }

  return json({
    ok: true,
    device: { id: device.id, name: device.name, childName: device.child?.name ?? '—', status: 'active' },
    ingested: acks.length,
    acks,
    extras: {
      installedApps: installedAppsCount,
      screenSessionCreated,
      syncEventsCreated,
    },
  })
}
