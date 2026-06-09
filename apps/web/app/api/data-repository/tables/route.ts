// /api/data-repository/tables — reference-platform-compatible list +
// create. Delegates to the same Prisma model as /api/repo/tables but
// returns a {success, data} envelope.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensurePhysicalTable } from '@/lib/repo-physical'
import { count as routerCount } from '@/lib/repo-router'
import { ok, fail } from '../_helpers'

export async function GET() {
  try {
    const tables = await prisma.repoTable.findMany({
      orderBy: [{ folderId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        folder: { select: { id: true, name: true } },
        connection: { select: { id: true, name: true, type: true, config: true } },
      },
    })
    // List view: don't fire a per-table COUNT(*) into the remote
    // engines on every page load — for huge Oracle tables (7.5M rows)
    // that dominates TTFB. Use the cached `rowCount` column on the
    // repo_tables row instead. The detail endpoint refreshes the
    // cache when an admin actually opens a table.
    const result = tables.map((t) => {
      const conn = t.connection
        ? { ...t.connection, config: { ...(t.connection.config as any), password: '••••••••' } }
        : null
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        connectionId: t.connectionId,
        connectionName: t.connection?.name ?? null,
        folderId: t.folderId,
        rowCount: t.rowCount,
        sortOrder: t.sortOrder,
        syncStatus: 'idle' as const,
        lastSyncAt: null,
        schema: t.schemaJson,
        createdAt: t.createdAt,
        connection: conn,
      }
    })
    return ok({ tables: result })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description, connectionId, folderId, externalTableName, columns } = body || {}
    if (!name) return fail('Name is required')
    const importMode = !!(connectionId && externalTableName)
    if (!importMode) {
      // owned: create physical table in PG
      await ensurePhysicalTable(name, columns ?? [])
    }
    const created = await prisma.repoTable.create({
      data: {
        name,
        description: description ?? null,
        connectionId: connectionId || null,
        externalTableName: externalTableName ?? null,
        folderId: folderId || null,
        schemaJson: (columns ?? []) as any,
        category: 'OTHER' as any,
      },
    })
    return ok({ table: created }, { status: 201 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
