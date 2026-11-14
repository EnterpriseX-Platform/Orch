import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, TENANT_COOKIE, TENANT_FEATURES } from '@/lib/tenant'

// GET /api/tenants/current — the resolved tenant + its feature switches
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  const tenant = ctx.tenantId
    ? await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, name: true, slug: true } })
    : null
  return NextResponse.json({
    tenant,
    role: ctx.role,
    isSystemAdmin: ctx.isSystemAdmin,
    features: ctx.features,
    featureCatalog: TENANT_FEATURES.map(({ key, label }) => ({ key, label })),
  })
}

// PUT /api/tenants/current { tenantId } — switch tenant (membership checked)
export async function PUT(request: NextRequest) {
  const { tenantId } = await request.json().catch(() => ({}))
  if (typeof tenantId !== 'string' || !tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }
  // Resolve as if the cookie were already set, so the membership check applies.
  const probe = new NextRequest(request.url, { headers: new Headers(request.headers) })
  probe.headers.set('x-tenant-id', tenantId)
  const ctx = await getTenantContext(probe)
  if (ctx.tenantId !== tenantId) {
    return NextResponse.json({ error: 'You do not have access to this tenant' }, { status: 403 })
  }
  const res = NextResponse.json({ tenantId, features: ctx.features })
  res.cookies.set(TENANT_COOKIE, tenantId, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  return res
}
