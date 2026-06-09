import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/dashboard - Get dashboard stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const period = searchParams.get('period') || 'day'

    // Get current date
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thisWeek = new Date(today)
    thisWeek.setDate(thisWeek.getDate() - 7)
    const thisMonth = new Date(today)
    thisMonth.setMonth(thisMonth.getMonth() - 1)

    // Get counts
    const [
      totalProjects,
      activeProjects,
      totalApis,
      activeApis,
      totalDatasets,
      activeDatasets,
      totalFlows,
      activeFlows,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.apiRegistration.count(),
      prisma.apiRegistration.count({ where: { status: 'ACTIVE' } }),
      prisma.dataCatalog.count(),
      prisma.dataCatalog.count({ where: { status: 'ACTIVE' } }),
      prisma.flowIntegration.count(),
      prisma.flowIntegration.count({ where: { isActive: true } }),
    ])

    // Get request stats
    const [
      totalRequests,
      requestsToday,
      requestsThisWeek,
      requestsThisMonth,
      avgResponseTime,
      errorCount,
    ] = await Promise.all([
      prisma.apiLog.count(),
      prisma.apiLog.count({ where: { timestamp: { gte: today } } }),
      prisma.apiLog.count({ where: { timestamp: { gte: thisWeek } } }),
      prisma.apiLog.count({ where: { timestamp: { gte: thisMonth } } }),
      prisma.apiLog.aggregate({ _avg: { duration: true } }),
      prisma.apiLog.count({ where: { statusCode: { gte: 400 } } }),
    ])

    // Get requests over time
    const daysToFetch = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 365
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - daysToFetch)

    const requestsOverTime = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('day', timestamp) as date,
        COUNT(*) as count
      FROM api_logs
      WHERE timestamp >= ${startDate}
      GROUP BY DATE_TRUNC('day', timestamp)
      ORDER BY date ASC
    `

    // Get top APIs
    const topApis = await prisma.apiLog.groupBy({
      by: ['apiId'],
      _count: { id: true },
      _avg: { duration: true },
      where: { timestamp: { gte: thisWeek } },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    // Get API details for top APIs
    const topApisWithDetails = await Promise.all(
      topApis.map(async (api: any) => {
        const apiDetails = await prisma.apiRegistration.findUnique({
          where: { id: api.apiId },
          select: { name: true, endpoint: true },
        })

        const errorCount = await prisma.apiLog.count({
          where: {
            apiId: api.apiId,
            statusCode: { gte: 400 },
            timestamp: { gte: thisWeek },
          },
        })

        return {
          apiId: api.apiId,
          apiName: apiDetails?.name || 'Unknown',
          endpoint: apiDetails?.endpoint || '',
          requestCount: Number(api._count.id),
          avgResponseTime: Math.round(api._avg.duration || 0),
          errorRate: Math.round((errorCount / Number(api._count.id)) * 100),
        }
      })
    )

    // Get status distribution
    const statusDistribution = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
          WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
          WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
          WHEN status_code >= 500 THEN '5xx'
          ELSE 'other'
        END as status,
        COUNT(*) as count
      FROM api_logs
      WHERE timestamp >= ${thisWeek}
      GROUP BY 
        CASE 
          WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
          WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
          WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
          WHEN status_code >= 500 THEN '5xx'
          ELSE 'other'
        END
    `

    // Get method distribution
    const methodDistribution = await prisma.apiLog.groupBy({
      by: ['method'],
      _count: { id: true },
      where: { timestamp: { gte: thisWeek } },
    })

    return NextResponse.json({
      stats: {
        totalProjects,
        activeProjects,
        totalApis,
        activeApis,
        totalDatasets,
        activeDatasets,
        totalFlows,
        activeFlows,
        totalRequests: Number(totalRequests),
        requestsToday: Number(requestsToday),
        requestsThisWeek: Number(requestsThisWeek),
        requestsThisMonth: Number(requestsThisMonth),
        avgResponseTime: Math.round(avgResponseTime._avg.duration || 0),
        errorRate: totalRequests > 0 ? Math.round((Number(errorCount) / Number(totalRequests)) * 100) : 0,
      },
      requestsOverTime: (requestsOverTime as any[]).map((r) => ({
        timestamp: r.date,
        value: Number(r.count),
      })),
      topApis: topApisWithDetails,
      statusDistribution: (statusDistribution as any[]).map((s) => ({
        status: s.status,
        count: Number(s.count),
      })),
      methodDistribution: methodDistribution.map((m: any) => ({
        method: m.method,
        count: Number(m._count.id),
      })),
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
