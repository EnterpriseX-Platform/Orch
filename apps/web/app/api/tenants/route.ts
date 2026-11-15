import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getTenantContext, invalidateTenantCache } from '@/lib/tenant'

// GET /api/tenants — tenants the caller can switch to (system admins see all)
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (!ctx.userId) return NextResponse.json({ data: [], currentTenantId: null })

  const tenants = await prisma.tenant.findMany({
    where: ctx.isSystemAdmin ? {} : { members: { some: { userId: ctx.userId } } },
    orderBy: { name: 'asc' },
    include: {
      members: { where: { userId: ctx.userId }, select: { role: true } },
      _count: { select: { members: true, projects: true } },
    },
  })

  return NextResponse.json({
    currentTenantId: ctx.tenantId,
    data: tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      isActive: t.isActive,
      role: t.members[0]?.role ?? (ctx.isSystemAdmin ? 'owner' : null),
      memberCount: t._count.members,
      projectCount: t._count.projects,
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1, 'Tenant name is required'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug may contain only a-z, 0-9 and -').optional(),
  description: z.string().optional(),
})

// POST /api/tenants — system admins create a tenant; creator becomes owner
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (!ctx.userId || !ctx.isSystemAdmin) {
    return NextResponse.json({ error: 'System administrators only' }, { status: 403 })
  }
  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { name, description } = parsed.data
  const slug =
    parsed.data.slug ||
    name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') ||
    `tenant-${Date.now()}`

  if (await prisma.tenant.findUnique({ where: { slug } })) {
    return NextResponse.json({ error: 'This slug is already taken' }, { status: 409 })
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      description,
      members: { create: { userId: ctx.userId, role: 'owner' } },
    },
  })
  invalidateTenantCache()
  return NextResponse.json({ data: tenant }, { status: 201 })
}
