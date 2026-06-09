import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getBrokerUrl } from '@/lib/system-config';

const prisma = new PrismaClient();

// Get monitor data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';

    const BROKER_URL = await getBrokerUrl();

    // Fetch broker health
    let brokerHealth = { status: 'unknown', latency: 0 };
    try {
      const start = Date.now();
      const healthRes = await fetch(`${BROKER_URL}/health`, { 
        signal: AbortSignal.timeout(5000) 
      });
      brokerHealth = {
        status: healthRes.ok ? 'online' : 'error',
        latency: Date.now() - start,
      };
    } catch {
      brokerHealth = { status: 'offline', latency: -1 };
    }

    // Fetch metrics from broker
    let brokerMetrics = null;
    try {
      const metricsRes = await fetch(`${BROKER_URL}/broker/metrics`, {
        signal: AbortSignal.timeout(5000)
      });
      if (metricsRes.ok) {
        brokerMetrics = await metricsRes.json();
      }
    } catch {
      // Ignore metrics fetch errors
    }

    const response: any = {
      timestamp: new Date().toISOString(),
    };

    // System Health
    if (type === 'all' || type === 'health') {
      // Check database
      let dbHealth = { status: 'unknown', latency: 0 };
      try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbHealth = { status: 'online', latency: Date.now() - start };
      } catch {
        dbHealth = { status: 'offline', latency: -1 };
      }

      response.health = {
        gateway: brokerHealth,
        database: dbHealth,
        kafka: brokerMetrics?.kafka || { status: 'unknown' },
        cache: { status: 'online', size: brokerMetrics?.cache_size || 0 },
      };
    }

    // Metrics
    if (type === 'all' || type === 'metrics') {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get recent requests count
      const [requestCount, errorCount, avgResponseTime] = await Promise.all([
        prisma.apiLog.count({
          where: { timestamp: { gte: oneHourAgo } },
        }),
        prisma.apiLog.count({
          where: { 
            timestamp: { gte: oneHourAgo },
            statusCode: { gte: 400 },
          },
        }),
        prisma.apiLog.aggregate({
          where: { timestamp: { gte: oneHourAgo } },
          _avg: { duration: true },
        }),
      ]);

      // Get per-minute stats for the last hour.
      // Cast COUNT/SUM to int / AVG to float so Prisma returns plain numbers
      // instead of BigInt / Decimal (neither is JSON-serializable out of the box).
      const perMinuteStatsRaw = await prisma.$queryRaw<Array<{
        minute: Date
        count: number
        avg_response_time: number | null
        errors: number
      }>>`
        SELECT
          DATE_TRUNC('minute', timestamp) as minute,
          COUNT(*)::int as count,
          AVG(duration)::float as avg_response_time,
          SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::int as errors
        FROM api_logs
        WHERE timestamp >= ${oneHourAgo}
        GROUP BY DATE_TRUNC('minute', timestamp)
        ORDER BY minute ASC
        LIMIT 60
      `;
      const perMinuteStats = perMinuteStatsRaw.map((r) => ({
        minute: r.minute,
        count: Number(r.count),
        avg_response_time: r.avg_response_time == null ? 0 : Number(r.avg_response_time),
        errors: Number(r.errors),
      }));

      response.metrics = {
        requestsPerHour: requestCount,
        errorsPerHour: errorCount,
        avgResponseTime: Math.round(avgResponseTime._avg.duration || 0),
        errorRate: requestCount > 0 ? (errorCount / requestCount * 100).toFixed(2) : '0.00',
        perMinute: perMinuteStats,
        ...brokerMetrics?.runtime,
      };
    }

    // Queue Status
    if (type === 'all' || type === 'queue') {
      response.queue = brokerMetrics?.queue || {
        default: { pending: 0, processing: 0 },
        high: { pending: 0, processing: 0 },
        low: { pending: 0, processing: 0 },
      };
    }

    // Worker status — forward broker's `workers` block so UI tabs that
    // want aggregate counts (Queue Status, Overview) don't have to hit
    // /api/workers separately.
    if (type === 'all' || type === 'workers') {
      const w = brokerMetrics?.workers?.workers; // broker nests the stats
      response.workers = w
        ? {
            total: w.total ?? 0,
            running: w.running ?? 0,
            stopped: w.stopped ?? 0,
            error: w.error ?? 0,
            total_processed: w.total_processed ?? 0,
            total_failed: w.total_failed ?? 0,
          }
        : { total: 0, running: 0, stopped: 0, error: 0, total_processed: 0, total_failed: 0 };
    }

    // Recent Errors
    if (type === 'all' || type === 'errors') {
      const recentErrors = await prisma.apiLog.findMany({
        where: { statusCode: { gte: 400 } },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          method: true,
          path: true,
          statusCode: true,
          duration: true,
          timestamp: true,
          responseBody: true,
        },
      });

      response.errors = recentErrors.map((e: any) => ({
        id: e.id,
        method: e.method,
        path: e.path,
        statusCode: e.statusCode,
        responseTime: e.duration,
        timestamp: e.timestamp,
        message: e.responseBody?.message || e.responseBody?.error || `HTTP ${e.statusCode}`,
      }));
    }

    // Active Connections (from broker)
    if (type === 'all' || type === 'connections') {
      response.connections = brokerMetrics?.connections || {
        websocket: 0,
        http: 0,
        concurrent: 0,
      };
    }

    return Response.json(response);
  } catch (error) {
    console.error('Monitor API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
