const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  // Testa escrever uma notificação com direction e ler de volta
  const dev = await p.device.findFirst()
  if (!dev) { console.log('sem devices para testar'); return }
  const n = await p.notificationEvent.create({
    data: { deviceId: dev.id, platform: 'whatsapp', packageName: 'com.whatsapp', title: 'TEST_DIR', text: 'verify', direction: 'outgoing', timestamp: new Date() }
  })
  console.log('criado com direction:', n.direction)
  const read = await p.notificationEvent.findUnique({ where: { id: n.id }, select: { direction: true } })
  console.log('lido de volta:', read)
  await p.notificationEvent.delete({ where: { id: n.id } })
  console.log('✓ limpo')
}
main().catch(e => { console.error('ERR:', e.message.split('\n')[0]); process.exit(1) }).finally(() => p.$disconnect())
