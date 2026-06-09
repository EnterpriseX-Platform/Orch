import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthPayload } from '@/lib/auth'
import { setConfig, invalidateAllConfig } from '@/lib/system-config'
import { z } from 'zod'

function requireAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  if (!payload) return { error: 'Unauthorized', status: 401 as const }
  const roles = payload.roles || []
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return { error: 'Forbidden — admin role required', status: 403 as const }
  }
  return { user: payload }
}

// GET /api/admin/system-config
//   ?category=BACKEND_URLS&projectId=<id>&search=myproject&includeSecrets=false
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = req.nextUrl
  const category = searchParams.get('category') || undefined
  const projectId = searchParams.get('projectId')
  const search = (searchParams.get('search') || '').trim().toLowerCase()
  const includeSecrets = searchParams.get('includeSecrets') === 'true'

  // Default to global-only when no projectId is given. Without this,
  // project-scoped rows (e.g. backendUrl on PROJECT-01) leak into the
  // global /orch/settings panel since Prisma returns all rows when
  // there's no `projectId` filter.
  const where: Record<string, unknown> = { projectId: null }
  if (category) where.category = category
  if (projectId === '_global') where.projectId = null
  else if (projectId) where.projectId = projectId

  const rows = await prisma.systemConfig.findMany({
    where,
    orderBy: [{ category: 'asc' }, { group: 'asc' }, { key: 'asc' }],
  })

  const data = rows
    .filter((r) => !search || r.key.toLowerCase().includes(search) || (r.label || '').toLowerCase().includes(search))
    .map((r) => ({
      id: r.id,
      key: r.key,
      value: r.isSecret && !includeSecrets ? '***' : r.value,
      valueType: r.valueType,
      category: r.category,
      label: r.label,
      description: r.description,
      group: r.group,
      isSecret: r.isSecret,
      isRequired: r.isRequired,
      isReadOnly: r.isReadOnly,
      validation: r.validation,
      defaultValue: r.defaultValue,
      projectId: r.projectId,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }))

  return NextResponse.json({ data, total: data.length })
}

// POST /api/admin/system-config  — create a new config definition
const createSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  valueType: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'URL', 'SECRET']).default('STRING'),
  category: z
    .enum([
      'GENERAL',
      'BACKEND_URLS',
      'KAFKA',
      'AUDIT',
      'SECURITY',
      'PERFORMANCE',
      'ALERTS',
      'FEATURE_FLAGS',
      'UI_BRANDING',
      'PROJECT',
    ])
    .default('GENERAL'),
  label: z.string().optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  isSecret: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  validation: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  projectId: z.string().nullable().optional(),
  reason: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const input = createSchema.parse(body)
    const projectId = input.projectId ?? null

    const existing = await prisma.systemConfig.findFirst({
      where: { key: input.key, projectId },
    })

    if (existing) {
      return NextResponse.json(
        { error: `Config "${input.key}" already exists for scope ${projectId ?? 'global'}` },
        { status: 409 },
      )
    }

    const row = await prisma.systemConfig.create({
      data: {
        key: input.key,
        value: input.value as never,
        valueType: input.valueType,
        category: input.category,
        label: input.label,
        description: input.description,
        group: input.group,
        isSecret: input.isSecret ?? false,
        isRequired: input.isRequired ?? false,
        isReadOnly: input.isReadOnly ?? false,
        validation: input.validation as never,
        defaultValue: input.defaultValue as never,
        projectId,
        updatedBy: auth.user.userId,
      },
    })

    await prisma.systemConfigHistory.create({
      data: {
        configKey: input.key,
        projectId,
        oldValue: undefined,
        newValue: input.value as never,
        changedBy: auth.user.userId,
        reason: input.reason || 'Initial create',
      },
    })

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error creating config:', error)
    return NextResponse.json({ error: 'Failed to create configuration' }, { status: 500 })
  }
}

// DELETE /api/admin/system-config?reloadCache=true
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const reloadCache = req.nextUrl.searchParams.get('reloadCache') === 'true'
  if (reloadCache) {
    invalidateAllConfig()
    return NextResponse.json({ success: true, action: 'cache invalidated' })
  }

  // Bulk update via PATCH shape
  try {
    const body = await req.json().catch(() => null)
    if (body && Array.isArray(body.updates)) {
      let count = 0
      for (const u of body.updates as Array<{ key: string; value: unknown; projectId?: string | null; reason?: string }>) {
        await setConfig({
          key: u.key,
          value: u.value,
          userId: auth.user.userId,
          projectId: u.projectId ?? null,
          reason: u.reason,
        })
        count += 1
      }
      return NextResponse.json({ success: true, updated: count })
    }
    return NextResponse.json({ error: 'Body must contain updates[] or use ?reloadCache=true' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
