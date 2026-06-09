// GET /api/data-repository/tables/:id/structure — column list with
// engine info. Reference UI's Properties tab calls this.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { describe as routerDescribe } from '@/lib/repo-router'
import { ok, fail } from '../../../_helpers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const t = await prisma.repoTable.findUnique({
      where: { id },
      include: { connection: true },
    })
    if (!t) return fail('Not found', 404)
    const columns = await routerDescribe(t as any).catch((e) => {
      console.warn('[structure] describe failed:', e?.message ?? e)
      return []
    })
    const engine = t.connection?.type ?? 'postgresql'
    return ok({ columns, engine })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
