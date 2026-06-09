import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const patchSchema = z.object({
  system: z.string().nullable().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.screen.findUnique({
    where: { id },
    include: {
      buttons: {
        include: { messageFormat: { select: { id: true, name: true, code: true, actionType: true } } },
        orderBy: { buttonLabel: 'asc' },
      },
    },
  })
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: item })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())
    const updated = await prisma.screen.update({ where: { id }, data: body })
    return NextResponse.json({ data: updated })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.screen.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
