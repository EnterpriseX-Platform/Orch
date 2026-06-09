import { prisma } from '../lib/prisma'

async function main() {
  try {
    const count = await prisma.apiRegistration.count()
    console.log('API count:', count)
    
    const apis = await prisma.apiRegistration.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        dataCatalog: true,
        flow: true,
        _count: { select: { apiLogs: true } }
      }
    })
    console.log('APIs:', JSON.stringify(apis, null, 2))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
