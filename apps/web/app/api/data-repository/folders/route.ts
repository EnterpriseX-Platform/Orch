import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantWhere, featureGuard } from '@/lib/tenant'
import { ok, fail } from '../_helpers'

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'dataRepository')
  if (blocked) return blocked
  try {
    const folders = await prisma.repoFolder.findMany({
      where: tenantWhere(ctx),
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { tables: { select: { id: true } } },
    })
    return ok({ folders })
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
    if (!body?.name) return fail('Name required')
    const created = await prisma.repoFolder.create({
      data: {
        tenantId: ctx.tenantId ?? undefined,
        name: body.name,
        parentId: body.parentId || null,
        sortOrder: body.sortOrder ?? 0,
      },
    })
    return ok({ folder: created }, { status: 201 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
