/**
 * /api/repo/tables — Data Repository tables CRUD.
 *
 * GET    : list all RepoTable records (with row counts)
 * POST   : create a RepoTable + its physical table
 *          body: { name, displayName?, description?, category?,
 *                  folderId?, columns: RepoColumn[] }
 *
 * Each table gets:
 *   - a row in `repo_tables`
 *   - a real Postgres table named `repo_<name>` ready for CRUD
 *   - auto-published CRUD endpoints under /api/repo/tables/:id/rows
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ensurePhysicalTable } from '@/lib/repo-physical'
import { count as routerCount } from '@/lib/repo-router'

const columnSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  type: z.string().min(1),
  nullable: z.boolean().optional(),
  encrypted: z.boolean().optional(),
})

const createSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  displayName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.enum([
    'TRANSACTIONAL','RESERVED','TRANSFER','PERFORMANCE',
    'EXPENDITURE','PROCUREMENT','OPERATION','MASTER_DATA','OTHER',
  ]).optional(),
  folderId: z.string().optional().nullable(),
  columns: z.array(columnSchema).min(1),
  // Import-from-connection mode: when both fields are set, the
  // physical table already exists on the remote DB so we DO NOT
  // CREATE TABLE on Orch's Postgres. We just record the link.
  connectionId: z.string().optional().nullable(),
  externalTableName: z.string().optional().nullable(),
})

export async function GET() {
  const tables = await prisma.repoTable.findMany({
    orderBy: [{ folderId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      folder: { select: { id: true, name: true } },
      // Need connection.config + type so routerCount can dispatch to
      // the right engine (Postgres / MySQL / Oracle) for external rows.
      connection: { select: { id: true, name: true, type: true, config: true } },
    },
  })
  // Refresh row counts in parallel. Owned tables hit local Postgres
  // (cheap COUNT(*)); external tables hit their connection. Failures
  // fall back to 0 so a single broken connection doesn't blank the
  // whole list.
  const result = await Promise.all(
    tables.map(async t => ({
      ...t,
      // Strip password before returning the connection metadata.
      connection: t.connection
        ? { ...t.connection, config: { ...(t.connection.config as any), password: '••••••••' } }
        : null,
      rowCount: await routerCount(t as any).catch(() => 0),
    })),
  )
  return NextResponse.json({ data: result })
}

export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json())
    const importMode = !!(body.connectionId && body.externalTableName)
    // In owned mode we create the physical table; in import mode the
    // table already exists in the remote DB so we just record the link.
    if (!importMode) {
      await ensurePhysicalTable(body.name, body.columns)
    }
    const created = await prisma.repoTable.create({
      data: {
        name: body.name,
        displayName: body.displayName ?? null,
        description: body.description ?? null,
        category: (body.category ?? 'OTHER') as any,
        folderId: body.folderId ?? null,
        schemaJson: body.columns as any,
        connectionId: body.connectionId ?? null,
        externalTableName: body.externalTableName ?? null,
      } as any,
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
