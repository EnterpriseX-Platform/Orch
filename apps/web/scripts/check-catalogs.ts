import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const cats = await p.dataCatalog.groupBy({
    by: ['category'],
    _count: { _all: true },
  })
  console.log('Catalog counts by category:')
  for (const c of cats) console.log(`  ${c.category.padEnd(20)} ${c._count._all}`)
  console.log('\nUser roles:')
  const users = await p.user.findMany({ select: { username: true, roles: true } })
  for (const u of users) console.log(`  ${u.username} → role=${(u as any).roles ?? 'N/A'}`)
  console.log('\nAudit retention range:')
  const oldest = await p.auditLog.findFirst({ orderBy: { timestamp: 'asc' }, select: { timestamp: true } })
  const newest = await p.auditLog.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } })
  if (oldest && newest) {
    const days = (newest.timestamp.getTime() - oldest.timestamp.getTime()) / 86400000
    console.log(`  oldest: ${oldest.timestamp.toISOString()}`)
    console.log(`  newest: ${newest.timestamp.toISOString()}`)
    console.log(`  span:   ${days.toFixed(1)} days`)
  }
}
main().catch(console.error).finally(() => p.$disconnect())
