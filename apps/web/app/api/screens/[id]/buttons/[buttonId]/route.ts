import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const patch = z.object({
  tabName: z.string().nullable().optional(),
  buttonLabel: z.string().min(1).optional(),
  actionType: z.string().nullable().optional(),
  messageFormatId: z.string().nullable().optional(),
  detectionSource: z.enum(['REFERER', 'HEADER', 'BODY_PATH', 'QUERY', 'MANUAL']).nullable().optional(),
  detectionField: z.string().nullable().optional(),
  detectionValue: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; buttonId: string }> }) {
  try {
    const { buttonId } = await params
    const body = patch.parse(await req.json())
    const updated = await prisma.screenButton.update({ where: { id: buttonId }, data: body })
    return NextResponse.json({ data: updated })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; buttonId: string }> }) {
  const { buttonId } = await params
  await prisma.screenButton.delete({ where: { id: buttonId } })
  return NextResponse.json({ ok: true })
}
