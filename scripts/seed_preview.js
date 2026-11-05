// Cria utilizador de demonstração + dados realistas para preview do redesign.
// Dados associados ao utilizador demo — fáceis de limpar depois (cascade por deviceId).
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const fs = require('fs')
const p = new PrismaClient()

const DEMO_EMAIL = 'demo@guardian.link'
const DEMO_PASS = 'demo1234'

async function main() {
  // Limpa demos anteriores (idempotente)
  const existing = await p.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (existing) {
    await p.user.delete({ where: { id: existing.id } }) // cascade limpa tudo
    console.log('demo anterior removido')
  }

  const hash = await bcrypt.hash(DEMO_PASS, 10)
  const user = await p.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: hash,
      name: 'Ana Demo',
      jurisdiction: 'BR',
      locale: 'pt-BR',
      role: 'parent',
      onboardingStep: 5,
    },
  })
  console.log('user criado:', user.id)

  const child = await p.child.create({
    data: { name: 'Sofia', birthDate: new Date('2012-04-15'), userId: user.id },
  })
  const device = await p.device.create({
    data: {
      childId: child.id,
      userId: user.id,
      name: 'Samsung A54',
      model: 'SM-A546E',
      osVersion: 'Android 14',
      agentVersion: '2.4.1',
      installCode: String(Math.floor(100000 + Math.random() * 900000)),
      status: 'active',
      consentGiven: true,
      connectionType: 'companion',
      lastSeenAt: new Date(),
    },
  })
  console.log('device criado:', device.id)

  const assets = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/preview_assets.json', 'utf8'))

  // ---- Notifications (mensagens instantâneas) ----
  const now = Date.now()
  const min = 60 * 1000
  const hr = 60 * min
  const day = 24 * hr

  const notifs = [
    // Conversa: WhatsApp / Maria
    { platform: 'whatsapp', title: 'Maria', text: 'oi amiga, tudo bem?', ts: now - 2*hr },
    { platform: 'whatsapp', title: 'Maria: que horas vc chega?', text: 'que horas vc chega?', ts: now - 2*hr + 3*min },
    { platform: 'whatsapp', title: 'Maria: 🤣🤣', text: '🤣🤣', ts: now - 2*hr + 5*min },
    { platform: 'whatsapp', title: 'Maria: [IMG]', text: '[IMG] olha essa foto', hasImage: true, img: 0, ts: now - 90*min },

    // Conversa: Instagram / João (flagged cyberbullying)
    { platform: 'instagram', title: 'João', text: 'ninguém te quer aqui', ts: now - 3*hr, flagged: true, flagReason: 'cyberbullying', severity: 'high' },
    { platform: 'instagram', title: 'João: some daqui', text: 'some daqui, ninguém gosta de vc', ts: now - 3*hr + 2*min, flagged: true, flagReason: 'cyberbullying', severity: 'high' },

    // Conversa: TikTok / @carol
    { platform: 'tiktok', title: '@carol.dz', text: 'viu meu novo video? ❤️', ts: now - 5*hr },
    { platform: 'tiktok', title: '@carol.dz: comentem!', text: 'comentem galera 🔥', ts: now - 5*hr + 4*min },

    // Conversa: Snapchat / Pedro
    { platform: 'snapchat', title: 'Pedro: snap!', text: 'snap! 📸', ts: now - 6*hr },

    // Conversa: WhatsApp / Grupo Família
    { platform: 'whatsapp', title: 'Grupo Família: Mãe', text: 'jantar às 19h, não se atrasem ❤️', ts: now - 8*hr },

    // Conversa: Messenger / Lucas (áudio)
    { platform: 'messenger', title: 'Lucas', text: '[AUDIO] te mandei um áudio', hasAudio: true, ts: now - 1*day },

    // Conversa: Instagram / desconhecido (predator — critical)
    { platform: 'instagram', title: '+55 11 9••••-4422', text: 'me manda foto sua linda', ts: now - 1*day - 2*hr, flagged: true, flagReason: 'predator', severity: 'critical' },
    { platform: 'instagram', title: '+55 11 9••••-4422: onde vc estuda?', text: 'onde vc estuda? queria te conhecer', ts: now - 1*day - 2*hr + 5*min, flagged: true, flagReason: 'predator', severity: 'critical' },

    // Conversa: Telegram / Tio
    { platform: 'telegram', title: 'Tio Carlos', text: 'parabéns sobrinha! 🎂', ts: now - 2*day },

    // Mais WhatsApp / Maria (atividade recente)
    { platform: 'whatsapp', title: 'Maria: bom diaaa', text: 'bom diaaa ☀️', ts: now - 12*min },
  ]

  for (const n of notifs) {
    await p.notificationEvent.create({
      data: {
        deviceId: device.id,
        platform: n.platform,
        packageName: `com.${n.platform}`,
        title: n.title,
        text: n.text,
        hasImage: !!n.hasImage,
        imageBase64: n.hasImage ? assets.notif_images[n.img].split(',')[1] : null,
        hasAudio: !!n.hasAudio,
        audioUri: n.hasAudio ? 'content://media/audio/123' : null,
        flagged: !!n.flagged,
        flagReason: n.flagReason ?? null,
        severity: n.severity ?? null,
        timestamp: new Date(n.ts),
      },
    })
  }
  console.log('notifications criadas:', notifs.length)

  // ---- Media (galeria) ----
  const sources = ['gallery','whatsapp','camera','instagram','download']
  for (let i = 0; i < assets.photos.length; i++) {
    const ph = assets.photos[i]
    const isVideo = i === 3
    const isAudio = i === 7
    const type = isVideo ? 'video' : isAudio ? 'audio' : 'photo'
    const flagged = i === 5
    await p.mediaEvent.create({
      data: {
        deviceId: device.id,
        type,
        fileName: ph.name,
        mimeType: type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/jpeg',
        sizeBytes: 800000 + i * 240000,
        storagePath: `/media/${device.id}/${ph.name}`,
        thumbnail: type === 'audio' ? null : ph.b64,
        flagged,
        flagReason: flagged ? 'inappropriate' : null,
        source: sources[i % sources.length],
        timestamp: new Date(now - i * 3 * hr),
      },
    })
  }
  console.log('media criados:', assets.photos.length)

  console.log('\n=== CREDENCIAIS DEMO ===')
  console.log('email:', DEMO_EMAIL)
  console.log('pass :', DEMO_PASS)
  await p.$disconnect()
}

main().catch(e => { console.error('ERR:', e); process.exit(1) })
