import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, featureGuard, isForeign } from '@/lib/tenant'
import { ok, fail } from '../../_helpers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'dataRepository')
  if (blocked) return blocked
  try {
    const { id } = await params
    const own = await prisma.repoApiKey.findUnique({ where: { id }, select: { tenantId: true } })
    if (!own || isForeign(ctx, own)) return fail('Not found', 404)
    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.permissions !== undefined) data.permissions = body.permissions
    if (body.isActive !== undefined) data.isActive = body.isActive
    const updated = await prisma.repoApiKey.update({ where: { id }, data })
    return ok({ key: updated })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(_req)
  const blocked = featureGuard(ctx, 'dataRepository')
  if (blocked) return blocked
  try {
    const { id } = await params
    const own = await prisma.repoApiKey.findUnique({ where: { id }, select: { tenantId: true } })
    if (!own || isForeign(ctx, own)) return fail('Not found', 404)
    await prisma.repoApiKey.delete({ where: { id } })
    return ok({})
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
