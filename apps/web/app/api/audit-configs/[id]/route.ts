import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, featureGuard, isForeign, projectAllowed } from '@/lib/tenant'
import { z } from 'zod'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  extractFields: z.any().nullable().optional(),
  auditFields: z.any().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(_req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  const { id } = await params
  if (ctx.tenantId) {
    const own = await prisma.auditConfig.findUnique({ where: { id: id }, select: { project: { select: { tenantId: true } } } })
    if (isForeign(ctx, own?.project)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const item = await prisma.auditConfig.findUnique({
    where: { id },
    include: { messageFormats: { select: { id: true, name: true, code: true } } },
  })
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: item })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  try {
    const { id } = await params
    if (ctx.tenantId) {
      const own = await prisma.auditConfig.findUnique({ where: { id: id }, select: { project: { select: { tenantId: true } } } })
      if (isForeign(ctx, own?.project)) return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const body = patchSchema.parse(await req.json())
    if (!(await projectAllowed(ctx, (body as { projectId?: unknown }).projectId))) {
      return NextResponse.json({ error: 'project not found' }, { status: 404 })
    }
    const updated = await prisma.auditConfig.update({ where: { id }, data: body as any })
    return NextResponse.json({ data: updated })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(_req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  const { id } = await params
  if (ctx.tenantId) {
    const own = await prisma.auditConfig.findUnique({ where: { id: id }, select: { project: { select: { tenantId: true } } } })
    if (isForeign(ctx, own?.project)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  await prisma.auditConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
