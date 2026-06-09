import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  listExternalTables, type ConnectionType, type ConnectionConfig,
} from '@/lib/repo-connections'
import { ok, fail } from '../../../_helpers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conn = await prisma.repoConnection.findUnique({ where: { id } })
    if (!conn) return fail('Not found', 404)
    const tables = await listExternalTables(
      conn.type as ConnectionType,
      conn.config as ConnectionConfig,
    )
    // Reference shape: [{ name, schema? }]
    const shaped = tables.map((t: any) => {
      if (Array.isArray(t)) return { name: t[0], schema: t[1] }
      return t
    })
    return ok({ tables: shaped })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
