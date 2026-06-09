// /api/data-repository/tables/:id/rows — insert / update / delete.
// Reference shapes:
//   POST   { values }                                  → insert
//   PATCH  { rid, newValues, originalRow }             → update
//   DELETE body { rid, originalRow }                   → delete
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  describe as routerDescribe,
  insertRow as routerInsert,
  updateRow as routerUpdate,
  deleteRow as routerDelete,
} from '@/lib/repo-router'
import { ok, fail } from '../../../_helpers'

async function loadTable(id: string) {
  const t = await prisma.repoTable.findUnique({ where: { id }, include: { connection: true } })
  if (!t) throw new Error('Not found')
  return t
}

// router{Update,Delete} take a numeric `id` for owned tables; external
// connections aren't writable from the UI (helper throws). The
// reference frontend sends `_rid` which is the auto-id for owned rows
// and `idx:<offset>` for external — for external we surface a clear
// error rather than pretending it worked.
function parseRid(rid: string | undefined): number | null {
  if (!rid || rid.startsWith('idx:')) return null
  const n = Number(rid)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await loadTable(id)
    const body = await req.json()
    // Reference sends raw column values; keep that contract.
    const values = (body && typeof body === 'object' && body.values) ? body.values : body
    const cols = await routerDescribe(t as any)
    const allowed = new Set(
      (cols as any[])
        .map((c) => c.name)
        .filter((n) => n !== 'id' && n !== 'created_at' && n !== 'updated_at'),
    )
    const filtered: Record<string, unknown> = {}
    for (const k of Object.keys(values || {})) {
      if (allowed.has(k)) filtered[k] = (values as any)[k]
    }
    const inserted = await routerInsert(t as any, filtered)
    return ok({ row: inserted }, { status: 201 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await loadTable(id)
    const body = await req.json()
    const rowId = parseRid(body?.rid)
    if (rowId == null) return fail('Update by composite key is not supported on external connections')
    const updated = await routerUpdate(t as any, rowId, body?.newValues || {})
    return ok({ row: updated })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await loadTable(id)
    const body = await req.json().catch(() => ({}))
    const rowId = parseRid(body?.rid)
    if (rowId == null) return fail('Delete by composite key is not supported on external connections')
    await routerDelete(t as any, rowId)
    return ok({})
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
