// /api/data-repository/connections — list + create connections.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantWhere, featureGuard } from '@/lib/tenant'
import { ok, fail } from '../_helpers'

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'dataRepository')
  if (blocked) return blocked
  try {
    const data = await prisma.repoConnection.findMany({
      where: tenantWhere(ctx),
      orderBy: { name: 'asc' },
      include: { _count: { select: { tables: true } } },
    })
    const safe = data.map((c) => {
      const cfg = (c.config ?? {}) as any
      return { ...c, config: { ...cfg, password: cfg.password ? '••••••••' : '' } }
    })
    return ok({ connections: safe })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'dataRepository')
  if (blocked) return blocked
  try {
    const body = await req.json()
    if (!body?.name || !body?.type || !body?.config) return fail('name, type, config required')
    const created = await prisma.repoConnection.create({
      data: {
        tenantId: ctx.tenantId ?? undefined,
        name: body.name,
        type: body.type,
        config: body.config,
        status: 'Disconnected',
      },
    })
    return ok({ connection: { ...created, config: { ...(created.config as any), password: '••••••••' } } }, { status: 201 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
