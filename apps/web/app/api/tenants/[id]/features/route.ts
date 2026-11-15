import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canManageTenant, getTenantContext, invalidateTenantCache, loadFeatures, TENANT_FEATURES } from '@/lib/tenant'

type Params = { params: Promise<{ id: string }> }

async function authorize(request: NextRequest, id: string) {
  const probe = new NextRequest(request.url, { headers: new Headers(request.headers) })
  probe.headers.set('x-tenant-id', id)
  const ctx = await getTenantContext(probe)
  if (!ctx.userId || ctx.tenantId !== id) return { ctx, error: 'You do not have access to this tenant' }
  return { ctx, error: null }
}

// GET /api/tenants/:id/features
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { error } = await authorize(request, id)
  if (error) return NextResponse.json({ error }, { status: 403 })
  const features = await loadFeatures(id)
  return NextResponse.json({
    data: TENANT_FEATURES.map(({ key, label }) => ({ key, label, enabled: features[key] })),
  })
}

// PUT /api/tenants/:id/features { features: { [key]: boolean } }
export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { ctx, error } = await authorize(request, id)
  if (error) return NextResponse.json({ error }, { status: 403 })
  if (!canManageTenant(ctx)) {
    return NextResponse.json({ error: 'Tenant owner/admin only' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const input = (body?.features ?? {}) as Record<string, unknown>
  const known = new Set<string>(TENANT_FEATURES.map((f) => f.key))

  await prisma.$transaction(
    Object.entries(input)
      .filter(([k, v]) => known.has(k) && typeof v === 'boolean')
      .map(([featureKey, enabled]) =>
        prisma.tenantFeature.upsert({
          where: { tenantId_featureKey: { tenantId: id, featureKey } },
          create: { tenantId: id, featureKey, enabled: enabled as boolean },
          update: { enabled: enabled as boolean },
        }),
      ),
  )
  invalidateTenantCache()
  const features = await loadFeatures(id)
  return NextResponse.json({
    data: TENANT_FEATURES.map(({ key, label }) => ({ key, label, enabled: features[key] })),
  })
}
