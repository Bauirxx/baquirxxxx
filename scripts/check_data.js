const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function run() {
  const tables = ['user','child','device','notification','mediaItem','alert','sosEvent','callLog','smsEvent']
  for (const t of tables) {
    try {
      const count = await p[t].count()
      console.log(`${t}: ${count}`)
    } catch(e) { console.log(`${t}: (n/a)`) }
  }
  await p.$disconnect()
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1) })
