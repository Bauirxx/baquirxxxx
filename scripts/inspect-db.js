// Script: conta todos os registros por tabela e identifica contas de teste
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const tables = [
    'user', 'session', 'child', 'device', 'consentRecord',
    'locationEvent', 'callEvent', 'smsEvent', 'appUsageEvent', 'browserEvent',
    'socialAlert', 'sosEvent', 'auditLog', 'installedApp', 'syncConfig',
    'screenSession', 'screenshot', 'syncEvent'
  ]
  console.log('--- CONTAGEM POR TABELA ---')
  for (const t of tables) {
    try {
      const count = await db[t].count()
      console.log(`  ${t}: ${count}`)
    } catch (e) {
      console.log(`  ${t}: erro (${e.message.split('\n')[0]})`)
    }
  }

  console.log('\n--- UTILIZADORES REGISTADOS ---')
  const users = await db.user.findMany({ select: { id: true, email: true, name: true, jurisdiction: true, onboardingStep: true, createdAt: true } })
  users.forEach(u => console.log(`  ${u.email} (${u.name}, ${u.jurisdiction}, step ${u.onboardingStep}, criado em ${u.createdAt.toISOString()})`))

  console.log('\n--- DISPOSITIVOS REGISTADOS ---')
  const devices = await db.device.findMany({ select: { id: true, name: true, status: true, installCode: true, userId: true, registeredAt: true } })
  devices.forEach(d => console.log(`  ${d.name} (code ${d.installCode}, ${d.status}, user ${d.userId}, registado em ${d.registeredAt.toISOString()})`))

  console.log('\n--- EVENTOS POR DISPOSITIVO (top 5) ---')
  const eventsByDevice = await Promise.all([
    db.locationEvent.groupBy({ by: ['deviceId'], _count: { _all: true } }),
    db.callEvent.groupBy({ by: ['deviceId'], _count: { _all: true } }),
    db.smsEvent.groupBy({ by: ['deviceId'], _count: { _all: true } }),
    db.appUsageEvent.groupBy({ by: ['deviceId'], _count: { _all: true } }),
    db.browserEvent.groupBy({ by: ['deviceId'], _count: { _all: true } }),
    db.socialAlert.groupBy({ by: ['deviceId'], _count: { _all: true } }),
    db.sosEvent.groupBy({ by: ['deviceId'], _count: { _all: true } }),
  ])
  const types = ['location', 'call', 'sms', 'app', 'browser', 'alert', 'sos']
  eventsByDevice.forEach((group, i) => {
    console.log(`  ${types[i]}:`)
    if (group.length === 0) console.log('    (vazio)')
    group.forEach(g => console.log(`    deviceId ${g.deviceId}: ${g._count._all}`))
  })
}

main()
  .then(() => db.$disconnect())
  .catch(e => { console.error(e); db.$disconnect(); process.exit(1) })
