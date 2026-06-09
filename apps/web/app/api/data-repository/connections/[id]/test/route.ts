import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testConnection, type ConnectionType, type ConnectionConfig } from '@/lib/repo-connections'
import { ok, fail } from '../../../_helpers'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conn = await prisma.repoConnection.findUnique({ where: { id } })
    if (!conn) return fail('Not found', 404)
    const cfg = (conn.config ?? {}) as ConnectionConfig
    const result = await testConnection(conn.type as ConnectionType, cfg)
    await prisma.repoConnection.update({
      where: { id },
      data: { status: result.ok ? 'Connected' : 'Error', lastTestedAt: new Date() },
    })
    return ok(result)
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
