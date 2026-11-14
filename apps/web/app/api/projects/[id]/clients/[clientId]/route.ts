import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, featureGuard, isForeign } from '@/lib/tenant'
import { z } from 'zod'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  appCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; clientId: string }> }) {
  const ctx = await getTenantContext(_req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  const { clientId } = await params
  if (ctx.tenantId) {
    const own = await prisma.client.findUnique({ where: { id: clientId }, select: { project: { select: { tenantId: true } } } })
    if (isForeign(ctx, own?.project)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const item = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      screens: {
        include: {
          buttons: {
            include: { messageFormat: { select: { id: true, code: true, name: true, actionType: true } } },
          },
        },
        orderBy: { code: 'asc' },
      },
    },
  })
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: item })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; clientId: string }> }) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  try {
    const { clientId } = await params
    if (ctx.tenantId) {
      const own = await prisma.client.findUnique({ where: { id: clientId }, select: { project: { select: { tenantId: true } } } })
      if (isForeign(ctx, own?.project)) return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const body = patchSchema.parse(await req.json())
    const updated = await prisma.client.update({ where: { id: clientId }, data: body })
    return NextResponse.json({ data: updated })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; clientId: string }> }) {
  const ctx = await getTenantContext(_req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  const { clientId } = await params
  if (ctx.tenantId) {
    const own = await prisma.client.findUnique({ where: { id: clientId }, select: { project: { select: { tenantId: true } } } })
    if (isForeign(ctx, own?.project)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  await prisma.client.delete({ where: { id: clientId } })
  return NextResponse.json({ ok: true })
}
