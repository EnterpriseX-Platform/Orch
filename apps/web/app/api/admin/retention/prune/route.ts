/**
 * POST /api/admin/retention/prune
 *
 * Runs the retention cleanup manually. Deletes rows older than the
 * configured window from audit_logs, api_logs, and event_logs.
 *
 * Reads windows from system_configs:
 *   audit.retentionDays    (default 365, 0 = keep forever)
 *   logs.retentionDays     (default 30)
 *   events.retentionDays   (default 30)
 *
 * Body (optional): { dryRun?: boolean }
 *   dryRun=true → only count what WOULD be deleted.
 *
 * In production this endpoint should be hit by a Kubernetes CronJob
 * on the schedule from `retention.cronSchedule`. An operator can also
 * invoke it from the Settings → Retention tab for an immediate sweep.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthPayload } from '@/lib/auth'
import { getNumberConfig } from '@/lib/system-config'

async function requireAdmin(req: NextRequest) {
  const p = getAuthPayload(req)
  if (!p) return { ok: false as const, status: 401, msg: 'Unauthorized' }
  const roles = p.roles || []
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return { ok: false as const, status: 403, msg: 'Forbidden' }
  }
  return { ok: true as const, user: p }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const dryRun: boolean = body?.dryRun === true

  const [auditDays, logsDays, eventsDays] = await Promise.all([
    getNumberConfig('audit.retentionDays', 365),
    getNumberConfig('logs.retentionDays', 30),
    getNumberConfig('events.retentionDays', 30),
  ])

  const now = Date.now()
  const cutoff = (days: number) => new Date(now - days * 86400_000)

  const out: Record<string, unknown> = { dryRun, cutoffs: {} as Record<string, string> }

  type Task = {
    name: 'audit_logs' | 'api_logs' | 'event_logs'
    days: number
    field: 'timestamp'
    count: () => Promise<number>
    del: () => Promise<{ count: number }>
  }

  const tasks: Task[] = [
    {
      name: 'audit_logs',
      days: auditDays,
      field: 'timestamp',
      count: () => prisma.auditLog.count({ where: { timestamp: { lt: cutoff(auditDays) } } }),
      del: () => prisma.auditLog.deleteMany({ where: { timestamp: { lt: cutoff(auditDays) } } }),
    },
    {
      name: 'api_logs',
      days: logsDays,
      field: 'timestamp',
      count: () => prisma.apiLog.count({ where: { timestamp: { lt: cutoff(logsDays) } } }),
      del: () => prisma.apiLog.deleteMany({ where: { timestamp: { lt: cutoff(logsDays) } } }),
    },
    {
      name: 'event_logs',
      days: eventsDays,
      field: 'timestamp',
      count: () => prisma.eventLog.count({ where: { timestamp: { lt: cutoff(eventsDays) } } }),
      del: () => prisma.eventLog.deleteMany({ where: { timestamp: { lt: cutoff(eventsDays) } } }),
    },
  ]

  for (const t of tasks) {
    if (t.days <= 0) {
      ;(out[t.name] as unknown) = { days: t.days, skipped: 'retention=0 means keep forever' }
      continue
    }
    ;(out.cutoffs as Record<string, string>)[t.name] = cutoff(t.days).toISOString()
    const eligible = await t.count()
    if (dryRun) {
      ;(out[t.name] as unknown) = { days: t.days, wouldDelete: eligible }
    } else {
      const r = await t.del()
      ;(out[t.name] as unknown) = { days: t.days, deleted: r.count }
    }
  }

  return NextResponse.json(out)
}
