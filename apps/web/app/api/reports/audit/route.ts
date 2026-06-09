import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// Audit Reports API — generic; aggregates audit_logs across all systems.
// GET /api/reports/audit?type=daily|user|errors|capacity&from=&to=&userId=
// ============================================

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600 * 1000)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') || 'daily'
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const userId = searchParams.get('userId')
  const userIp = searchParams.get('userIp')
  const screenCode = searchParams.get('screenCode')
  const actionType = searchParams.get('actionType')

  const from = fromParam ? new Date(fromParam) : hoursAgo(24)
  const to = toParam ? new Date(toParam) : new Date()

  // No hardcoded entityType filter (the old per-project constant is gone).
  // Aggregate all audit activity in range (refine via userId/userIp). NOTE:
  // per-system scoping needs a reliable `changes.system` tag on audit rows;
  // today it's mostly null (verified), so we don't filter by it yet. Proper
  // fix: derive `system` from the project on audit writes (see
  // LOGGING_DESIGN.md), then scope reports by it.
  const where: any = { timestamp: { gte: from, lte: to } }
  if (userId) where.userId = userId
  if (userIp) where.userIp = userIp

  // Functional filters on the JSON `changes` payload. The route previously
  // accepted these params but never applied them; filter post-fetch since the
  // values live in JSONB (username = real actor, screen = formatName/screenName,
  // system tag). Empty filters are no-ops.
  const fUser = (searchParams.get('username') || '').trim().toLowerCase()
  const fSystem = (searchParams.get('system') || '').trim()
  const fScreen = (screenCode || '').trim().toLowerCase()
  const matchExtra = (l: { changes?: unknown }) => {
    const c = (l.changes || {}) as any
    if (fUser && !String(c.username || '').toLowerCase().includes(fUser)) return false
    if (fSystem && fSystem !== 'ALL' && String(c.system || '') !== fSystem) return false
    if (fScreen && !`${c.screenCode || ''} ${c.formatCode || ''} ${c.screenName || ''} ${c.formatName || ''}`.toLowerCase().includes(fScreen)) return false
    return true
  }

  try {
    if (type === 'daily') {
      // Daily summary: count by action type + screen + hourly buckets
      const logs = (await prisma.auditLog.findMany({
        where,
        select: { timestamp: true, action: true, changes: true, userId: true, userIp: true },
        orderBy: { timestamp: 'desc' },
        take: 10000,
      })).filter(matchExtra)

      const byActionType: Record<string, number> = {}
      const byScreen: Record<string, { count: number; screenName?: string }> = {}
      const bySystem: Record<string, number> = {}
      const hourly: Record<string, number> = {}
      let signoffCount = 0, submitCount = 0, exportCount = 0, errorCount = 0

      for (const l of logs) {
        const c = (l.changes || {}) as any
        const at = c.actionType || l.action || 'UNKNOWN'
        byActionType[at] = (byActionType[at] || 0) + 1
        // "Feature/screen" identity. Microflow audits populate formatName /
        // screenName (Thai labels) but often leave screenCode null, so fall
        // back through the populated fields instead of dropping the row.
        const sKey = c.screenCode || c.formatCode || c.screenName || c.formatName
        const sName = c.screenName || c.formatName || c.screenCode || c.formatCode
        if (sKey) {
          if (!byScreen[sKey]) byScreen[sKey] = { count: 0, screenName: sName || undefined }
          byScreen[sKey].count++
        }
        if (c.system) bySystem[c.system] = (bySystem[c.system] || 0) + 1
        const hourKey = new Date(l.timestamp).toISOString().slice(0, 13) + ':00'
        hourly[hourKey] = (hourly[hourKey] || 0) + 1
        if (at === 'SIGNOFF') signoffCount++
        if (at === 'SUBMIT') submitCount++
        if (at === 'EXPORT') exportCount++
        if (c.statusCode && c.statusCode >= 400) errorCount++
      }

      return NextResponse.json({
        type: 'daily',
        from, to,
        total: logs.length,
        summary: { signoffCount, submitCount, exportCount, errorCount },
        byActionType,
        byScreen: Object.entries(byScreen)
          .map(([code, v]) => ({ screenCode: code, screenName: v.screenName, count: v.count }))
          .sort((a, b) => b.count - a.count),
        bySystem,
        hourly: Object.entries(hourly).sort().map(([h, c]) => ({ hour: h, count: c })),
      })
    }

    if (type === 'user') {
      // User activity: timeline + count by action + screen
      const logs = (await prisma.auditLog.findMany({
        where,
        select: { id: true, timestamp: true, action: true, changes: true, userId: true, userIp: true, description: true },
        orderBy: { timestamp: 'desc' },
        take: 500,
      })).filter(matchExtra)
      const userStats: Record<string, any> = {}
      for (const l of logs) {
        const c = (l.changes || {}) as any
        // The real actor is changes.username (business-system user, e.g.
        // dept-unit1@example.com). userId is usually the system FK ("admin") so
        // keying on it collapses everyone into one row — key on the actor.
        const actor = c.username || l.userId || l.userIp || 'unknown'
        if (!userStats[actor]) userStats[actor] = { user: actor, ip: l.userIp, count: 0, actions: {} }
        userStats[actor].count++
        const at = c.actionType || l.action || 'UNKNOWN'
        userStats[actor].actions[at] = (userStats[actor].actions[at] || 0) + 1
      }
      return NextResponse.json({
        type: 'user',
        from, to,
        total: logs.length,
        users: Object.values(userStats).sort((a: any, b: any) => b.count - a.count),
        timeline: logs.slice(0, 100),
      })
    }

    if (type === 'errors') {
      // Errors: filter for status >= 400 OR SIGNOFF failures
      const logs = await prisma.auditLog.findMany({
        where,
        select: { id: true, timestamp: true, action: true, changes: true, userId: true, userIp: true, description: true },
        orderBy: { timestamp: 'desc' },
        take: 1000,
      })
      const errors = logs.filter(l => {
        const s = (l.changes as any)?.statusCode
        return s && s >= 400
      })
      const byEndpoint: Record<string, number> = {}
      const byStatusCode: Record<number, number> = {}
      for (const e of errors) {
        const c = e.changes as any
        const ep = c.path || 'unknown'
        byEndpoint[ep] = (byEndpoint[ep] || 0) + 1
        byStatusCode[c.statusCode] = (byStatusCode[c.statusCode] || 0) + 1
      }
      return NextResponse.json({
        type: 'errors',
        from, to,
        total: errors.length,
        byEndpoint: Object.entries(byEndpoint).map(([ep, c]) => ({ endpoint: ep, count: c })).sort((a, b) => b.count - a.count),
        byStatusCode,
        recent: errors.slice(0, 50),
      })
    }

    if (type === 'capacity') {
      const logs = await prisma.auditLog.findMany({
        where,
        select: { timestamp: true, changes: true },
        take: 20000,
      })
      const byEndpoint: Record<string, { count: number; totalMs: number; max: number; p95s: number[] }> = {}
      for (const l of logs) {
        const c = l.changes as any
        const ep = c?.path || 'unknown'
        const d = c?.durationMs || 0
        if (!byEndpoint[ep]) byEndpoint[ep] = { count: 0, totalMs: 0, max: 0, p95s: [] }
        byEndpoint[ep].count++
        byEndpoint[ep].totalMs += d
        byEndpoint[ep].max = Math.max(byEndpoint[ep].max, d)
        byEndpoint[ep].p95s.push(d)
      }
      const stats = Object.entries(byEndpoint).map(([ep, v]) => {
        const sorted = v.p95s.sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0
        return {
          endpoint: ep,
          count: v.count,
          avgMs: Math.round(v.totalMs / v.count),
          maxMs: v.max,
          p95Ms: p95,
        }
      }).sort((a, b) => b.count - a.count)

      return NextResponse.json({
        type: 'capacity',
        from, to,
        totalCalls: logs.length,
        endpoints: stats,
      })
    }

    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
  } catch (e: any) {
    console.error('[reports/audit] Error:', e)
    return NextResponse.json({ error: e.message || 'Report failed' }, { status: 500 })
  }
}
