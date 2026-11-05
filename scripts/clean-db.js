// Script: limpa todos os dados de teste da base de dados
// Mantém apenas a conta real do utilizador (abiliomonteiro95@gmail.com)
// Apaga: events, devices, children, consentRecords, auditLogs, sessions, syncConfigs,
// installedApps, screenSessions, screenshots, syncEvents, AND test users.

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const KEEP_EMAIL = 'abiliomonteiro95@gmail.com'

async function main() {
  console.log('🧹 Limpando base de dados...')

  // Primeiro: apagar todas as tabelas de eventos (não têm FKs que dependam delas)
  console.log('  - Apagando eventos (LocationEvent, CallEvent, SmsEvent, AppUsageEvent, BrowserEvent, SocialAlert, SosEvent, SyncEvent)...')
  await db.sosEvent.deleteMany()
  await db.socialAlert.deleteMany()
  await db.browserEvent.deleteMany()
  await db.appUsageEvent.deleteMany()
  await db.smsEvent.deleteMany()
  await db.callEvent.deleteMany()
  await db.locationEvent.deleteMany()
  await db.syncEvent.deleteMany()

  // Apagar screenshots, screen sessions, installed apps
  console.log('  - Apagando screenshots, screen sessions, installed apps...')
  await db.screenshot.deleteMany()
  await db.screenSession.deleteMany()
  await db.installedApp.deleteMany()

  // Apagar consent records (de teste)
  console.log('  - Apagando consent records...')
  await db.consentRecord.deleteMany()

  // Apagar audit logs (de teste)
  console.log('  - Apagando audit logs...')
  await db.auditLog.deleteMany()

  // Apagar sync config
  console.log('  - Apagando sync configs...')
  await db.syncConfig.deleteMany()

  // Apagar devices (de teste)
  console.log('  - Apagando devices...')
  await db.device.deleteMany()

  // Apagar children (de teste)
  console.log('  - Apagando children...')
  await db.child.deleteMany()

  // Apagar sessions (force re-login em todas as contas)
  console.log('  - Apagando sessions (force re-login)...')
  await db.session.deleteMany()

  // Apagar todos os utilizadores EXCETO o real
  console.log(`  - Apagando utilizadores de teste (mantendo: ${KEEP_EMAIL})...`)
  const deleted = await db.user.deleteMany({
    where: { email: { not: KEEP_EMAIL } }
  })
  console.log(`    ${deleted.count} contas de teste apagadas`)

  // Reset onboardingStep do utilizador real para que possa re-registar dispositivo
  console.log('  - Reset onboardingStep do utilizador real para 0 (re-onboarding)...')
  await db.user.update({
    where: { email: KEEP_EMAIL },
    data: { onboardingStep: 0 }
  })

  console.log('\n✅ Limpeza concluída!')
  console.log('\n📊 Estado final:')
  const counts = {
    users: await db.user.count(),
    sessions: await db.session.count(),
    children: await db.child.count(),
    devices: await db.device.count(),
    consentRecords: await db.consentRecord.count(),
    auditLogs: await db.auditLog.count(),
    locationEvents: await db.locationEvent.count(),
    callEvents: await db.callEvent.count(),
    smsEvents: await db.smsEvent.count(),
    appUsageEvents: await db.appUsageEvent.count(),
    browserEvents: await db.browserEvent.count(),
    socialAlerts: await db.socialAlert.count(),
    sosEvents: await db.sosEvent.count(),
    installedApps: await db.installedApp.count(),
    screenSessions: await db.screenSession.count(),
    screenshots: await db.screenshot.count(),
    syncConfigs: await db.syncConfig.count(),
    syncEvents: await db.syncEvent.count(),
  }
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
}

main()
  .then(() => db.$disconnect())
  .catch(e => { console.error('Erro:', e); db.$disconnect(); process.exit(1) })
