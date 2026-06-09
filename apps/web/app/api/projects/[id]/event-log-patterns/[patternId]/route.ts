import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const captureEnum = z.enum(['SUMMARY', 'FULL_BODY', 'NONE'])
const levelEnum = z.enum(['info', 'warn', 'error', 'debug'])

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  pathPattern: z.string().min(1).optional(),
  methodMatch: z.string().optional(),
  bodyMatch: z.array(z.object({
    source: z.enum(['BODY', 'HEADER']).default('BODY'),
    field: z.string().min(1),
    value: z.string(),
  })).nullable().optional(),
  capture: captureEnum.optional(),
  level: levelEnum.optional(),
  enabled: z.boolean().optional(),
})

// PUT /api/projects/[id]/event-log-patterns/[patternId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; patternId: string }> },
) {
  try {
    const { id: projectId, patternId } = await params
    const body = await request.json()
    const input = updateSchema.parse(body)

    // Verify the pattern actually belongs to this project before
    // updating — guards against cross-project URL guessing.
    const existing = await prisma.eventLogPattern.findUnique({ where: { id: patternId } })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 })
    }

    const row = await prisma.eventLogPattern.update({
      where: { id: patternId },
      data: {
        ...input,
        // Prisma requires explicit undefined to skip; null means
        // "clear the JSON column" in our schema.
        bodyMatch: input.bodyMatch === undefined ? undefined : (input.bodyMatch ?? null as any),
      },
    })
    return NextResponse.json(row)
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: e.issues }, { status: 400 })
    }
    console.error('Error updating event log pattern:', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/projects/[id]/event-log-patterns/[patternId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; patternId: string }> },
) {
  try {
    const { id: projectId, patternId } = await params
    const existing = await prisma.eventLogPattern.findUnique({ where: { id: patternId } })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 })
    }
    await prisma.eventLogPattern.delete({ where: { id: patternId } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Error deleting event log pattern:', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
