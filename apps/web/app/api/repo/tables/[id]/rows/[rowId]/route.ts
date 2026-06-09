/**
 * /api/repo/tables/:id/rows/:rowId — single-row update / delete.
 *
 * Reuses the dynamic-schema column-filter rule from the list/create
 * route so PATCH only writes columns that exist in the physical
 * table. DELETE is a straight by-id remove.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  describe as routerDescribe,
  updateRow as routerUpdate,
  deleteRow as routerDelete,
} from '@/lib/repo-router'

async function requireTable(id: string) {
  const t = await prisma.repoTable.findUnique({
    where: { id },
    include: { connection: true },
  })
  if (!t) throw new Error('Table not found')
  return t
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  try {
    const { id, rowId } = await params
    const t = await requireTable(id)
    const body = await req.json()
    const cols = await routerDescribe(t as any)
    const allowed = new Set(cols.map((c: any) => c.name).filter((n: string) => n !== 'id' && n !== 'created_at' && n !== 'updated_at'))
    const filtered: Record<string, unknown> = {}
    for (const k of Object.keys(body)) if (allowed.has(k)) filtered[k] = (body as any)[k]
    const row = await routerUpdate(t as any, parseInt(rowId, 10), filtered)
    return NextResponse.json({ data: row })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  try {
    const { id, rowId } = await params
    const t = await requireTable(id)
    await routerDelete(t as any, parseInt(rowId, 10))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 })
  }
}
