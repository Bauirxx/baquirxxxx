const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  // Verifica se a coluna já existe
  const cols = await p.$queryRawUnsafe`PRAGMA table_info(NotificationEvent)`
  const has = cols.some(c => c.name === 'direction')
  console.log('coluna direction existe?', has)
  if (!has) {
    await p.$executeRawUnsafe(`ALTER TABLE NotificationEvent ADD COLUMN direction TEXT NOT NULL DEFAULT 'incoming'`)
    console.log('✓ coluna direction adicionada (default incoming)')
  }
  // confirma
  const after = await p.$queryRawUnsafe`PRAGMA table_info(NotificationEvent)`
  console.log('colunas agora:', after.map(c => c.name).join(', '))
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1) }).finally(() => p.$disconnect())
