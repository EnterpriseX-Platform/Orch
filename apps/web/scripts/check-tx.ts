import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const a = await p.auditLog.findFirst({
    where: { entityId: 'TX-RELOAD-1' },
    orderBy: { timestamp: 'desc' },
  })
  console.log('TX-RELOAD-1 audit:')
  console.log(JSON.stringify(a, null, 2))
}
main().catch(console.error).finally(() => p.$disconnect())
