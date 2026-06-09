/**
 * /api/repo/connections/:id — single connection ops.
 *
 * GET    : connection record (password redacted)
 * PATCH  : update fields (config merge — password not sent leaves
 *          existing intact)
 * DELETE : drop connection (sets connectionId NULL on related tables)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['postgresql', 'mysql', 'oracle']).optional(),
  config: z.record(z.string(), z.any()).optional(),
})

function redactPassword(record: any) {
  if (!record) return record
  const cfg = (record.config ?? {}) as any
  return { ...record, config: { ...cfg, password: cfg.password ? '••••••••' : '' } }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await prisma.repoConnection.findUnique({ where: { id } })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: redactPassword(c) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())
    const existing = await prisma.repoConnection.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Merge config so admin can update host without resending password.
    const existingCfg = (existing.config ?? {}) as any
    const incomingCfg = body.config ?? {}
    const mergedCfg: any = { ...existingCfg, ...incomingCfg }
    // If password is masked, keep the existing one
    if (incomingCfg.password === '••••••••' || incomingCfg.password == null) {
      mergedCfg.password = existingCfg.password ?? ''
    }

    const updated = await prisma.repoConnection.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        type: body.type ?? undefined,
        config: mergedCfg,
      } as any,
    })
    return NextResponse.json({ data: redactPassword(updated) })
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.repoConnection.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
