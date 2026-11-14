/**
 * /api/projects/:id/clients — CRUD for Client (consumer app) entries
 * scoped to a Project.
 *
 * Each Client groups Screens for one consumer of this project's APIs
 * (e.g. "Web Client", "Mobile App"). The optional appCode is the
 * stable identifier the frontend can send via X-Client-App header for
 * explicit attribution.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, featureGuard, isForeign } from '@/lib/tenant'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  appCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(_req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  const { id: projectId } = await params
  if (ctx.tenantId) {
    const own = await prisma.project.findUnique({ where: { id: projectId }, select: { tenantId: true } })
    if (isForeign(ctx, own)) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const items = await prisma.client.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { screens: true } },
    },
  })
  return NextResponse.json({ data: items })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext(req)
  const blocked = featureGuard(ctx, 'projects')
  if (blocked) return blocked
  try {
    const { id: projectId } = await params
    if (ctx.tenantId) {
      const own = await prisma.project.findUnique({ where: { id: projectId }, select: { tenantId: true } })
      if (isForeign(ctx, own)) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const body = schema.parse(await req.json())
    const created = await prisma.client.create({ data: { ...body, projectId } })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
