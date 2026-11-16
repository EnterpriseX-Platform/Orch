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
    const owner = await prisma.repoConnection.findUnique({ where: { id }, select: { tenantId: true } })
    if (isForeign(ctx, owner)) return fail('Not found', 404)
    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.type !== undefined) data.type = body.type
    if (body.config !== undefined) data.config = body.config
    const updated = await prisma.repoConnection.update({ where: { id }, data })
    return ok({ connection: { ...updated, config: { ...(updated.config as any), password: '••••••••' } } })
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
    const owner = await prisma.repoConnection.findUnique({ where: { id }, select: { tenantId: true } })
    if (isForeign(ctx, owner)) return fail('Not found', 404)
    await prisma.repoConnection.delete({ where: { id } })
    return ok({})
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
