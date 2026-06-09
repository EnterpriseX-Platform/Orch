import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '../_helpers'

export async function GET() {
  try {
    const folders = await prisma.repoFolder.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { tables: { select: { id: true } } },
    })
    return ok({ folders })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body?.name) return fail('Name required')
    const created = await prisma.repoFolder.create({
      data: {
        name: body.name,
        parentId: body.parentId || null,
        sortOrder: body.sortOrder ?? 0,
      },
    })
    return ok({ folder: created }, { status: 201 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
