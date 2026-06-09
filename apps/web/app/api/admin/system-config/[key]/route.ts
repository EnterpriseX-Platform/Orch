import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthPayload } from '@/lib/auth'
import { setConfig, invalidateConfig } from '@/lib/system-config'
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

// GET /api/admin/system-config/:key?projectId=<id>&includeSecrets=false
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { key } = await params
  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('projectId')
  const includeSecrets = searchParams.get('includeSecrets') === 'true'
  const scope = projectId === '_global' || !projectId ? null : projectId

  const row = await prisma.systemConfig.findFirst({
    where: { key, projectId: scope },
  })

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    data: {
      ...row,
      value: row.isSecret && !includeSecrets ? '***' : row.value,
    },
  })
}

// PUT /api/admin/system-config/:key — update value
const updateSchema = z.object({
  value: z.unknown(),
  projectId: z.string().nullable().optional(),
  reason: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  isSecret: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { key } = await params
    const body = await req.json()
    const input = updateSchema.parse(body)

    const row = await setConfig({
      key,
      value: input.value,
      userId: auth.user.userId,
      projectId: input.projectId ?? null,
      reason: input.reason,
    })

    // Update metadata if provided (not part of setConfig)
    if (input.label || input.description || input.isSecret !== undefined) {
      await prisma.systemConfig.update({
        where: { id: row.id },
        data: {
          label: input.label ?? row.label,
          description: input.description ?? row.description,
          isSecret: input.isSecret ?? row.isSecret,
        },
      })
    }

    return NextResponse.json({ data: row })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Failed to update'
    console.error('Error updating config:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/admin/system-config/:key?projectId=<id>
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { key } = await params
    const projectId = req.nextUrl.searchParams.get('projectId')
    const scope = projectId === '_global' || !projectId ? null : projectId

    const existing = await prisma.systemConfig.findFirst({
      where: { key, projectId: scope },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.isReadOnly) {
      return NextResponse.json({ error: 'Cannot delete read-only config' }, { status: 403 })
    }

    await prisma.systemConfig.delete({ where: { id: existing.id } })
    await prisma.systemConfigHistory.create({
      data: {
        configKey: key,
        projectId: scope,
        oldValue: existing.value === null ? undefined : (existing.value as never),
        newValue: { deleted: true } as never,
        changedBy: auth.user.userId,
        reason: 'Deleted',
      },
    })
    invalidateConfig(key)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting config:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
