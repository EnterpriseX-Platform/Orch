/**
 * POST /api/repo/connections/:id/test — verify the connection by
 * running SELECT 1 (or DUAL) and updating `status` accordingly.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testConnection, type ConnectionType, type ConnectionConfig } from '@/lib/repo-connections'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conn = await prisma.repoConnection.findUnique({ where: { id } })
  if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cfg = (conn.config ?? {}) as ConnectionConfig
  const result = await testConnection(conn.type as ConnectionType, cfg)
  await prisma.repoConnection.update({
    where: { id },
    data: {
      status: result.ok ? 'Connected' : 'Error',
      lastTestedAt: new Date(),
    },
  })
  return NextResponse.json(result)
}
