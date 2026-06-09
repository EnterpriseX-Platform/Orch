/**
 * /api/screens/:id/buttons — manage ScreenButton entries that bind a
 * UI button to a MessageFormat. The optional detection rule lets the
 * gateway match incoming requests to the correct button without the
 * frontend having to send X-Source-* headers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const buttonSchema = z.object({
  tabName: z.string().nullable().optional(),
  buttonLabel: z.string().min(1),
  actionType: z.string().nullable().optional(),
  messageFormatId: z.string().nullable().optional(),
  detectionSource: z.enum(['REFERER', 'HEADER', 'BODY_PATH', 'QUERY', 'MANUAL']).nullable().optional(),
  detectionField: z.string().nullable().optional(),
  detectionValue: z.string().nullable().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = buttonSchema.parse(await req.json())
    const created = await prisma.screenButton.create({
      data: { ...body, screenId: id },
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
