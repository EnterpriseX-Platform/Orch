// POST /api/data-repository/tables/:id/import — accepts a JSON array
// of rows (UI parses CSV/XLSX client-side via xlsx library, then POSTs
// the parsed rows here). Inserts in chunks via routerInsert.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  describe as routerDescribe,
  insertRow as routerInsert,
} from '@/lib/repo-router'
import { ok, fail } from '../../../_helpers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await prisma.repoTable.findUnique({ where: { id }, include: { connection: true } })
    if (!t) return fail('Not found', 404)
    const body = await req.json()
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : Array.isArray(body) ? body : []
    if (rows.length === 0) return ok({ imported: 0, skipped: 0 })

    const cols = await routerDescribe(t as any)
    const allowed = new Set(
      (cols as any[])
        .map((c) => c.name)
        .filter((n) => n !== 'id' && n !== 'created_at' && n !== 'updated_at'),
    )

    let imported = 0
    let skipped = 0
    const errors: string[] = []
    for (const r of rows) {
      const filtered: Record<string, unknown> = {}
      for (const k of Object.keys(r || {})) {
        if (allowed.has(k)) filtered[k] = (r as any)[k]
      }
      try {
        await routerInsert(t as any, filtered)
        imported++
      } catch (e: any) {
        skipped++
        if (errors.length < 5) errors.push(String(e?.message ?? e))
      }
    }
    return ok({ imported, skipped, errors })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
