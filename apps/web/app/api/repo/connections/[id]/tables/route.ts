/**
 * GET /api/repo/connections/:id/tables — discover tables in the
 * remote database. Used by the "Add table from connection" wizard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listExternalTables, type ConnectionType, type ConnectionConfig } from '@/lib/repo-connections'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conn = await prisma.repoConnection.findUnique({ where: { id } })
    if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const tables = await listExternalTables(conn.type as ConnectionType, conn.config as ConnectionConfig)
    return NextResponse.json({ data: { tables } })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
