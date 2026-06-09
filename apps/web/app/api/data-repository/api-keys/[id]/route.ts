import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail } from '../../_helpers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.permissions !== undefined) data.permissions = body.permissions
    if (body.isActive !== undefined) data.isActive = body.isActive
    const updated = await prisma.repoApiKey.update({ where: { id }, data })
    return ok({ key: updated })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.repoApiKey.delete({ where: { id } })
    return ok({})
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
