import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '../../_helpers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.parentId !== undefined) data.parentId = body.parentId
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
    const updated = await prisma.repoFolder.update({ where: { id }, data })
    return ok({ folder: updated })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Detach tables before deleting the folder.
    await prisma.repoTable.updateMany({ where: { folderId: id }, data: { folderId: null } })
    await prisma.repoFolder.delete({ where: { id } })
    return ok({})
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
