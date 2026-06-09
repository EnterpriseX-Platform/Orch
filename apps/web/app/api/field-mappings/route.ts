/**
 * /api/field-mappings — CRUD for FieldMapping library entries.
 *
 * Library = reusable extraction template (refIdPath, userIdPath, ...)
 * shared across many MessageFormats. Per-format override fields on
 * MessageFormat win at runtime, so editing a library updates every
 * format unless they explicitly override that field.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const fieldMappingSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  refType: z.string().optional().nullable(),
  refIdPath: z.string().optional().nullable(),
  refNoPath: z.string().optional().nullable(),
  refNamePath: z.string().optional().nullable(),
  pkXPath: z.string().optional().nullable(),
  usernameSource: z.enum(['BODY_PATH', 'HEADER', 'JWT_CLAIM', 'SESSION', 'STATIC']).optional().nullable(),
  usernameField: z.string().optional().nullable(),
  usernameStatic: z.string().optional().nullable(),
  // Transaction grouping (Sprint: audit-transaction-key)
  // clobPath: JSONPath to a stringified CLOB inside the body.
  //   Example for microflow-envelope: "$.object.*.request"
  // transactionKeyFields: array of field names *inside* the parsed
  //   CLOB; their values are joined with "|" to make the txKey.
  //   Example for a passthrough proxy: ["FIELD_A", "FIELD_B"]
  clobPath: z.string().optional().nullable(),
  transactionKeyFields: z.array(z.string()).optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('projectId') || undefined
  const items = await prisma.fieldMapping.findMany({
    where: projectId ? { OR: [{ projectId }, { projectId: null }] } : undefined,
    orderBy: { name: 'asc' },
    include: { _count: { select: { messageFormats: true } } },
  })
  return NextResponse.json({ data: items })
}

export async function POST(req: NextRequest) {
  try {
    const body = fieldMappingSchema.parse(await req.json())
    const created = await prisma.fieldMapping.create({ data: body as any })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: e.issues }, { status: 400 })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
