/**
 * Internal config endpoint — returns all non-secret config values.
 * Used by orch-broker (Rust) and other internal services to read
 * runtime configuration without having to connect to the DB directly.
 *
 * Auth: optional shared secret in `X-Internal-Token` header. If the
 * env var `INTERNAL_API_TOKEN` is set, the header must match. If not
 * set, access is open within the cluster (protected by K8s NetworkPolicy).
 *
 * GET /api/internal/config
 *   → { data: { [key]: value, ... } }   # non-secrets only
 *
 * GET /api/internal/config?includeSecrets=true  # requires X-Internal-Token
 *   → { data: { ..., secret.key: "<real>" } }
 *
 * GET /api/internal/config?category=BACKEND_URLS
 *   → filtered by category
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function checkInternalAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.INTERNAL_API_TOKEN
  if (!expected) return { ok: true } // open inside cluster
  const got = req.headers.get('x-internal-token')
  if (got !== expected) return { ok: false, reason: 'Invalid X-Internal-Token' }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = checkInternalAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  const { searchParams } = req.nextUrl
  const category = searchParams.get('category') || undefined
  const includeSecrets = searchParams.get('includeSecrets') === 'true'

  // Even when allowed by auth, requesting secrets requires the token to be set
  if (includeSecrets && !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json(
      { error: 'includeSecrets requires INTERNAL_API_TOKEN to be configured' },
      { status: 403 },
    )
  }

  const where: Record<string, unknown> = { projectId: null } // global only
  if (category) where.category = category

  const rows = await prisma.systemConfig.findMany({ where })
  const data: Record<string, unknown> = {}
  for (const r of rows) {
    if (r.isSecret && !includeSecrets) continue
    data[r.key] = r.value
  }
  return NextResponse.json({ data, total: Object.keys(data).length })
}
