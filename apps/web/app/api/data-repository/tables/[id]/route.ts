// Single RepoTable view + management.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { dropPhysicalTable } from '@/lib/repo-physical'
import { describe as routerDescribe, count as routerCount } from '@/lib/repo-router'
import { ok, fail } from '../../_helpers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await prisma.repoTable.findUnique({
      where: { id },
      include: {
        folder: { select: { id: true, name: true } },
        connection: { select: { id: true, name: true, type: true, status: true, config: true } },
      },
    })
    if (!t) return fail('Not found', 404)
    const physical = await routerDescribe(t as any).catch(() => [])
    const rowCount = await routerCount(t as any).catch(() => 0)
    // Refresh the cached row count on the table row so the next
    // /tables list call shows a fresh number without paying the
    // COUNT(*) round-trip again.
    if (rowCount !== t.rowCount) {
      prisma.repoTable.update({ where: { id }, data: { rowCount } }).catch(() => undefined)
    }
    const conn = t.connection
      ? { ...t.connection, config: { ...(t.connection.config as any), password: '••••••••' } }
      : null
    return ok({
      table: { ...t, connection: conn, schema: physical, rowCount },
      schema: physical,
      rowCount,
    })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description
    if (body.folderId !== undefined) data.folderId = body.folderId
    if (body.connectionId !== undefined) data.connectionId = body.connectionId
    const updated = await prisma.repoTable.update({ where: { id }, data })
    return ok({ table: updated })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await prisma.repoTable.findUnique({ where: { id }, select: { name: true, connectionId: true } })
    if (!t) return fail('Not found', 404)
    if (!t.connectionId) await dropPhysicalTable(t.name).catch(() => undefined)
    await prisma.repoTable.delete({ where: { id } })
    return ok({})
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
