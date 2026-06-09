import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const captureEnum = z.enum(['SUMMARY', 'FULL_BODY', 'NONE'])
const levelEnum = z.enum(['info', 'warn', 'error', 'debug'])

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  pathPattern: z.string().min(1, 'pathPattern is required'),
  methodMatch: z.string().default('ANY'),
  // Same shape as MessageFormat.matchRules so admins reuse the same
  // mental model. Empty / null → no body constraints.
  bodyMatch: z.array(z.object({
    source: z.enum(['BODY', 'HEADER']).default('BODY'),
    field: z.string().min(1),
    value: z.string(),
  })).nullable().optional(),
  capture: captureEnum.default('SUMMARY'),
  level: levelEnum.default('info'),
  enabled: z.boolean().default(true),
})

// GET /api/projects/[id]/event-log-patterns?includeGlobal=true
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params
    const includeGlobal = request.nextUrl.searchParams.get('includeGlobal') === 'true'

    // Project rules always; global rules optional (some screens want
    // to show "what's also active globally" alongside per-project).
    const where = includeGlobal
      ? { OR: [{ projectId }, { projectId: null }] }
      : { projectId }
    const rows = await prisma.eventLogPattern.findMany({
      where,
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    })
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    console.error('Error listing event log patterns:', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}

// POST /api/projects/[id]/event-log-patterns
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params
    const body = await request.json()
    const input = createSchema.parse(body)

    const row = await prisma.eventLogPattern.create({
      data: {
        projectId,
        name: input.name,
        description: input.description,
        pathPattern: input.pathPattern,
        methodMatch: input.methodMatch,
        bodyMatch: input.bodyMatch ?? undefined,
        capture: input.capture,
        level: input.level,
        enabled: input.enabled,
      },
    })
    return NextResponse.json(row, { status: 201 })
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: e.issues }, { status: 400 })
    }
    console.error('Error creating event log pattern:', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
