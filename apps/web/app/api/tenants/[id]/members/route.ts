import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { canManageTenant, getTenantContext, invalidateTenantCache } from '@/lib/tenant'

type Params = { params: Promise<{ id: string }> }

async function authorize(request: NextRequest, id: string) {
  const probe = new NextRequest(request.url, { headers: new Headers(request.headers) })
  probe.headers.set('x-tenant-id', id)
  const ctx = await getTenantContext(probe)
  return { ctx, ok: !!ctx.userId && ctx.tenantId === id }
}

// GET /api/tenants/:id/members
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { ok } = await authorize(request, id)
  if (!ok) return NextResponse.json({ error: 'You do not have access to this tenant' }, { status: 403 })
  const members = await prisma.tenantMember.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, username: true, email: true, firstName: true, lastName: true } } },
  })
  return NextResponse.json({ data: members })
}

const upsertSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
})

// POST /api/tenants/:id/members { username, role } — add or change role
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { ctx, ok } = await authorize(request, id)
  if (!ok || !canManageTenant(ctx)) {
    return NextResponse.json({ error: 'Tenant owner/admin only' }, { status: 403 })
  }
  const parsed = upsertSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const member = await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: id, userId: user.id } },
    create: { tenantId: id, userId: user.id, role: parsed.data.role },
    update: { role: parsed.data.role },
  })
  invalidateTenantCache()
  return NextResponse.json({ data: member }, { status: 201 })
}

// DELETE /api/tenants/:id/members?userId=...
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { ctx, ok } = await authorize(request, id)
  if (!ok || !canManageTenant(ctx)) {
    return NextResponse.json({ error: 'Tenant owner/admin only' }, { status: 403 })
  }
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const owners = await prisma.tenantMember.count({ where: { tenantId: id, role: 'owner' } })
  const target = await prisma.tenantMember.findUnique({ where: { tenantId_userId: { tenantId: id, userId } } })
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner' && owners <= 1) {
    return NextResponse.json({ error: 'A tenant needs at least one owner' }, { status: 400 })
  }
  await prisma.tenantMember.delete({ where: { id: target.id } })
  invalidateTenantCache()
  return NextResponse.json({ ok: true })
}
