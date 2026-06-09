/**
 * /api/audit-configs — CRUD for AuditConfig library entries.
 *
 * Each entry is a named audit policy ("Strict", "Default", "Off").
 * MessageFormats reference one and may override `auditEnabled` on
 * a per-format basis.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
  extractFields: z.any().optional().nullable(),
  auditFields: z.any().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId') || undefined
  const items = await prisma.auditConfig.findMany({
    where: projectId ? { OR: [{ projectId }, { projectId: null }] } : undefined,
    orderBy: { name: 'asc' },
    include: { _count: { select: { messageFormats: true } } },
  })
  return NextResponse.json({ data: items })
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    const created = await prisma.auditConfig.create({ data: body as any })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
