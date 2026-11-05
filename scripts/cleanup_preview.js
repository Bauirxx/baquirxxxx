const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const u = await p.user.findUnique({ where: { email: 'demo@guardian.link' } })
  if (!u) { console.log('demo já não existe'); return }
  await p.user.delete({ where: { id: u.id } }) // cascade: child, device, notifications, media, sessions
  console.log('demo apagado (cascade completo)')
  // confirma
  const after = await p.user.count()
  console.log('utilizadores restantes:', after)
}
main().catch(e=>{console.error('ERR:',e);process.exit(1)}).finally(()=>p.$disconnect())
