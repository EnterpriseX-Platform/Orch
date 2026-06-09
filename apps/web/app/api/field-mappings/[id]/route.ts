import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  refType: z.string().nullable().optional(),
  refIdPath: z.string().nullable().optional(),
  refNoPath: z.string().nullable().optional(),
  refNamePath: z.string().nullable().optional(),
  pkXPath: z.string().nullable().optional(),
  usernameSource: z.enum(['BODY_PATH', 'HEADER', 'JWT_CLAIM', 'SESSION', 'STATIC']).nullable().optional(),
  usernameField: z.string().nullable().optional(),
  usernameStatic: z.string().nullable().optional(),
  // Transaction grouping
  clobPath: z.string().nullable().optional(),
  transactionKeyFields: z.array(z.string()).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.fieldMapping.findUnique({
    where: { id },
    include: { messageFormats: { select: { id: true, name: true, code: true } } },
  })
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: item })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())
    const updated = await prisma.fieldMapping.update({ where: { id }, data: body as any })
    return NextResponse.json({ data: updated })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // SetNull cascade — formats keep working with their override fields
  await prisma.fieldMapping.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
