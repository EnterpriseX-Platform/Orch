/**
 * /api/repo/tables/:id — single RepoTable view + management.
 *
 * GET    : RepoTable + live column descriptor (from information_schema)
 * PATCH  : update metadata (displayName, description, category, folder)
 * DELETE : drop the physical table + remove the metadata row
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { dropPhysicalTable } from '@/lib/repo-physical'
import { describe as routerDescribe, count as routerCount } from '@/lib/repo-router'

const patchSchema = z.object({
  displayName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.enum([
    'TRANSACTIONAL','RESERVED','TRANSFER','PERFORMANCE',
    'EXPENDITURE','PROCUREMENT','OPERATION','MASTER_DATA','OTHER',
  ]).optional(),
  folderId: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await prisma.repoTable.findUnique({
    where: { id },
    include: {
      folder: { select: { id: true, name: true } },
      connection: { select: { id: true, name: true, type: true, status: true, config: true } },
    },
  })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Routed describe/count — local for owned tables, remote for those
  // that point at an external connection. Failures fall back to empty
  // so the UI still renders.
  const physical = await routerDescribe(t as any).catch(() => [])
  const rowCount = await routerCount(t as any).catch(() => 0)
  // Strip password from connection in response
  const safeConn = t.connection
    ? { ...t.connection, config: { ...(t.connection.config as any), password: '••••••••' } }
    : null
  return NextResponse.json({
    data: { ...t, connection: safeConn, physicalColumns: physical, rowCount },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())
    const updated = await prisma.repoTable.update({
      where: { id },
      data: body as any,
    })
    return NextResponse.json({ data: updated })
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await prisma.repoTable.findUnique({ where: { id }, select: { name: true, connectionId: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Only drop the physical table if Orch owns it. External
  // connection tables must NEVER be dropped from here — that would
  // delete production data on someone else's database.
  if (!t.connectionId) {
    await dropPhysicalTable(t.name).catch(() => undefined)
  }
  await prisma.repoTable.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
