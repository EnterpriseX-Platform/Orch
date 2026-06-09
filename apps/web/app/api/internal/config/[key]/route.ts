/**
 * GET /api/internal/config/:key
 *   → { key, value, valueType, category, updatedAt }
 *
 * Same auth rules as /api/internal/config (see parent route).
 * Secrets are NEVER returned here — callers must use /api/internal/config?includeSecrets=true
 * with an X-Internal-Token.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function checkInternalAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.INTERNAL_API_TOKEN
  if (!expected) return { ok: true }
  const got = req.headers.get('x-internal-token')
  if (got !== expected) return { ok: false, reason: 'Invalid X-Internal-Token' }
  return { ok: true }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = checkInternalAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  const { key } = await params
  const projectId = req.nextUrl.searchParams.get('projectId')
  // Resolution: project-scoped first (if requested), fall back to global.
  let row = null as Awaited<ReturnType<typeof prisma.systemConfig.findFirst>>
  if (projectId) {
    row = await prisma.systemConfig.findFirst({ where: { key, projectId } })
  }
  if (!row) {
    row = await prisma.systemConfig.findFirst({ where: { key, projectId: null } })
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (row.isSecret) {
    return NextResponse.json(
      { error: 'Secret values are not exposed via this endpoint' },
      { status: 403 },
    )
  }

  return NextResponse.json({
    key: row.key,
    value: row.value,
    valueType: row.valueType,
    category: row.category,
    updatedAt: row.updatedAt,
  })
}
