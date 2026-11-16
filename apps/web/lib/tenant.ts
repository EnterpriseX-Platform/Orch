// ==========================================
// Multi-tenant context
// ==========================================
// The active tenant travels in the `orch-tenant` cookie (set by the tenant
// switcher). Every request re-checks it against TenantMember, so a forged
// cookie only falls back to the caller's own first tenant.
//
// Requests without a user (broker-internal calls, dev without a token) get
// `tenantId: null`, which means "no tenant filter" — the legacy behaviour.

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma'
import type { JwtPayload } from './auth'
import { getJwtSecret } from '@/lib/jwt-secret'

export const TENANT_COOKIE = 'orch-tenant'

/** Features a tenant can switch on/off. Keys are stored in tenant_features. */
export const TENANT_FEATURES = [
  { key: 'projects', label: 'Projects', paths: ['/projects', '/registers', '/api-keys', '/clients', '/screens', '/field-mappings', '/audit-configs'] },
  { key: 'datasets', label: 'Data Catalogs', paths: ['/datasets'] },
  { key: 'dataRepository', label: 'Data Repository', paths: ['/data-repository', '/repo'] },
  { key: 'flows', label: 'Flows', paths: ['/flows', '/flow-mappings', '/workers', '/worker-jobs', '/jobs'] },
  { key: 'eventLogs', label: 'Event Logs', paths: ['/logs', '/events'] },
  { key: 'audit', label: 'Audit', paths: ['/audit'] },
  { key: 'analytics', label: 'Analytics', paths: ['/reports'] },
  { key: 'monitor', label: 'System Monitor', paths: ['/monitor'] },
] as const

export type FeatureKey = (typeof TENANT_FEATURES)[number]['key']

export interface TenantContext {
  userId: string | null
  isSystemAdmin: boolean
  tenantId: string | null
  role: string | null
  features: Record<string, boolean>
}

function readUser(request: NextRequest): JwtPayload | null {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.cookies.get('auth-token')?.value
  if (!token) return null
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload
  } catch {
    return null
  }
}

// ---------- short-lived cache ----------
// getTenantContext runs on every API request. Membership and feature switches
// change rarely, so cache them for a few seconds per process; writes to
// members/features call invalidateTenantCache() so changes apply at once on
// the pod that made them (other pods converge within the TTL).
const TTL_MS = 5_000
const cache = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 5_000) cache.clear()
  return value
}
export function invalidateTenantCache() {
  cache.clear()
}

export async function loadFeatures(tenantId: string): Promise<Record<string, boolean>> {
  return cached(`f:${tenantId}`, () => loadFeaturesUncached(tenantId))
}

async function loadFeaturesUncached(tenantId: string): Promise<Record<string, boolean>> {
  const rows = await prisma.tenantFeature.findMany({ where: { tenantId } })
  const out: Record<string, boolean> = {}
  for (const f of TENANT_FEATURES) out[f.key] = true
  for (const r of rows) out[r.featureKey] = r.enabled
  return out
}

export async function getTenantContext(request: NextRequest): Promise<TenantContext> {
  const user = readUser(request)
  const all: Record<string, boolean> = Object.fromEntries(TENANT_FEATURES.map((f) => [f.key, true]))
  if (!user?.userId) {
    return { userId: null, isSystemAdmin: false, tenantId: null, role: null, features: all }
  }
  const isSystemAdmin = (user.roles || []).includes('admin')
  const wanted = request.headers.get('x-tenant-id') || request.cookies.get(TENANT_COOKIE)?.value

  let tenantId: string | null = null
  let role: string | null = null

  if (wanted) {
    const m = await cached(`m:${wanted}:${user.userId}`, () =>
      prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: wanted, userId: user.userId } },
      }),
    )
    if (m) {
      tenantId = m.tenantId
      role = m.role
    } else if (isSystemAdmin && (await cached(`t:${wanted}`, () => prisma.tenant.findUnique({ where: { id: wanted }, select: { id: true } })))) {
      tenantId = wanted
      role = 'owner'
    }
  }
  if (!tenantId) {
    const first = await cached(`first:${user.userId}`, () =>
      prisma.tenantMember.findFirst({
        where: { userId: user.userId, tenant: { isActive: true } },
        orderBy: { createdAt: 'asc' },
      }),
    )
    if (first) {
      tenantId = first.tenantId
      role = first.role
    }
  }

  return {
    userId: user.userId,
    isSystemAdmin,
    tenantId,
    role,
    features: tenantId ? await loadFeatures(tenantId) : all,
  }
}

/** Prisma `where` fragment for tenant-owned rows. Empty = no filtering. */
export function tenantWhere(ctx: TenantContext): { tenantId?: string } {
  return ctx.tenantId ? { tenantId: ctx.tenantId } : {}
}

/** Returns a 403 response when the feature is switched off for the tenant. */
export function featureGuard(ctx: TenantContext, key: FeatureKey): NextResponse | null {
  if (ctx.features[key] === false) {
    return NextResponse.json(
      { error: 'This feature is disabled for this tenant', feature: key },
      { status: 403 },
    )
  }
  return null
}

/** True when the row belongs to another tenant than the caller's. */
export function isForeign(ctx: TenantContext, row: { tenantId?: string | null } | null | undefined): boolean {
  return !!(ctx.tenantId && row && row.tenantId && row.tenantId !== ctx.tenantId)
}

export function canManageTenant(ctx: TenantContext): boolean {
  return ctx.isSystemAdmin || ctx.role === 'owner' || ctx.role === 'admin'
}

/**
 * True when `projectId` is empty or belongs to the caller's tenant.
 * Use before writing child rows whose project comes from the request body.
 */
export async function projectAllowed(ctx: TenantContext, projectId: unknown): Promise<boolean> {
  if (!ctx.tenantId || projectId == null || projectId === '') return true
  if (typeof projectId !== 'string') return false
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { tenantId: true } })
  return !!p && !isForeign(ctx, p)
}

/** Same as projectAllowed, for rows that point at a flow. */
export async function flowAllowed(ctx: TenantContext, flowId: unknown): Promise<boolean> {
  if (!ctx.tenantId || flowId == null || flowId === '') return true
  if (typeof flowId !== 'string') return false
  const f = await prisma.flowIntegration.findUnique({ where: { id: flowId }, select: { tenantId: true } })
  return !!f && !isForeign(ctx, f)
}

/**
 * Work out which tenant an audit row belongs to. Broker-originated audits
 * arrive without a user, so fall back to the flow / API registration /
 * message format they reference. Returns null when nothing matches.
 */
export async function resolveAuditTenant(opts: {
  ctx?: TenantContext | null
  flowId?: unknown
  flowName?: unknown
  apiId?: unknown
  formatName?: unknown
}): Promise<string | null> {
  if (opts.ctx?.tenantId) return opts.ctx.tenantId
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const flowId = str(opts.flowId)
  if (flowId) {
    const f = await prisma.flowIntegration.findUnique({ where: { id: flowId }, select: { tenantId: true } })
    if (f?.tenantId) return f.tenantId
  }
  const apiId = str(opts.apiId)
  if (apiId) {
    const a = await prisma.apiRegistration.findUnique({
      where: { id: apiId },
      select: { project: { select: { tenantId: true } } },
    })
    if (a?.project?.tenantId) return a.project.tenantId
  }
  const flowName = str(opts.flowName)
  if (flowName) {
    const f = await prisma.flowIntegration.findFirst({ where: { name: flowName }, select: { tenantId: true } })
    if (f?.tenantId) return f.tenantId
  }
  const formatName = str(opts.formatName)
  if (formatName) {
    const m = await prisma.messageFormat.findFirst({
      where: { name: formatName },
      select: { flow: { select: { tenantId: true } } },
    })
    if (m?.flow?.tenantId) return m.flow.tenantId
  }
  return null
}

/**
 * API registration ids owned by the tenant (through their project), used to
 * scope ApiLog queries — api_logs is written by the gateway and has no
 * tenant column of its own. Returns null when no tenant filter applies.
 */
export async function tenantApiIds(ctx: TenantContext): Promise<string[] | null> {
  if (!ctx.tenantId) return null
  const rows = await prisma.apiRegistration.findMany({
    where: { project: { tenantId: ctx.tenantId } },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}
