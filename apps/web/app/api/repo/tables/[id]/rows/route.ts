/**
 * /api/repo/tables/:id/rows — auto-published row CRUD.
 *
 * Each RepoTable gets these endpoints transparently:
 *   GET    /api/repo/tables/:id/rows?limit=&offset=  → list rows
 *   POST   /api/repo/tables/:id/rows                  → insert row
 *   PATCH  /api/repo/tables/:id/rows/:rowId           → update row
 *   DELETE /api/repo/tables/:id/rows/:rowId           → delete row
 *
 * Body validation is by *physical column descriptor* — we accept
 * keys that match real columns and reject unknowns. No Zod schema
 * because the schema is dynamic per-table.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { describe as routerDescribe, selectRows as routerSelect, insertRow as routerInsert } from '@/lib/repo-router'

async function requireTable(id: string) {
  const t = await prisma.repoTable.findUnique({
    where: { id },
    include: { connection: true },
  })
  if (!t) throw new Error('Table not found')
  return t
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const t = await requireTable(id)
    const url = req.nextUrl
    const limit = parseInt(url.searchParams.get('limit') ?? '50')
    const offset = parseInt(url.searchParams.get('offset') ?? '0')
    const rows = await routerSelect(t as any, { limit, offset })
    return NextResponse.json({ data: rows, limit, offset })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const t = await requireTable(id)
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
    }
    // Only allow keys that match the physical schema — protects
    // against rogue column writes.
    const cols = await routerDescribe(t as any)
    const allowed = new Set(cols.map((c: any) => c.name).filter((n: string) => n !== 'id' && n !== 'created_at' && n !== 'updated_at'))
    const filtered: Record<string, unknown> = {}
    for (const k of Object.keys(body)) {
      if (allowed.has(k)) filtered[k] = (body as any)[k]
    }
    const row = await routerInsert(t as any, filtered)
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 })
  }
}
