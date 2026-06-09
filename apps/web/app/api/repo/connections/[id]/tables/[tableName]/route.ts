/**
 * GET /api/repo/connections/:id/tables/:tableName — describe a
 * specific table on the remote connection. Used by the import modal
 * to preview the column list before committing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  describeExternalTable,
  type ConnectionType, type ConnectionConfig,
} from '@/lib/repo-connections'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tableName: string }> },
) {
  try {
    const { id, tableName } = await params
    const conn = await prisma.repoConnection.findUnique({ where: { id } })
    if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const cols = await describeExternalTable(
      conn.type as ConnectionType,
      conn.config as ConnectionConfig,
      tableName,
    )
    return NextResponse.json({ data: { columns: cols } })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
