// POST /api/data-repository/tables/:id/query — paged query.
// Body: { limit?: number, offset?: number, where?: Record<string, any> }
// Returns: { columns, rows, totalCount }
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  describe as routerDescribe,
  count as routerCount,
  selectRows as routerSelect,
} from '@/lib/repo-router'
import { ok, fail } from '../../../_helpers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const limit = Math.max(1, Math.min(Number(body.limit ?? 50), 1000))
    const offset = Math.max(0, Number(body.offset ?? 0))

    const t = await prisma.repoTable.findUnique({
      where: { id },
      include: { connection: true },
    })
    if (!t) return fail('Not found', 404)

    const [columns, rows, totalCount] = await Promise.all([
      routerDescribe(t as any).catch(() => []),
      routerSelect(t as any, { limit, offset }).catch((e) => {
        // Surface the error in the response so the UI can show a
        // friendly message ("Table doesn't exist on remote", etc.)
        return Promise.reject(e)
      }),
      routerCount(t as any).catch(() => 0),
    ])

    // Add a synthetic _rid for each row so the UI can identify a row
    // for edit/delete. For owned tables we use the auto `id` column;
    // for external connections we fall back to row index. The PATCH
    // / DELETE endpoints accept either form.
    const rowsWithRid = rows.map((r: any, i: number) => ({
      _rid: r.id != null ? String(r.id) : `idx:${offset + i}`,
      ...r,
    }))

    return ok({ columns, rows: rowsWithRid, totalCount })
  } catch (e: any) {
    return ok({ error: String(e?.message ?? e), columns: [], rows: [], totalCount: 0 })
  }
}
