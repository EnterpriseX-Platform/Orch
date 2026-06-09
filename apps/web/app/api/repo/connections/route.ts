/**
 * /api/repo/connections — external DB connection CRUD.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const configSchema = z.object({
  host: z.string().min(1),
  port: z.string().or(z.number()).default(''),
  database: z.string().min(1),
  username: z.string().optional(),
  user: z.string().optional(),
  password: z.string().default(''),
  ssl: z.boolean().optional(),
  serviceName: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['postgresql', 'mysql', 'oracle']),
  config: configSchema,
})

export async function GET() {
  const data = await prisma.repoConnection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { tables: true } } },
  })
  // Strip password from config before returning
  const safe = data.map(c => {
    const cfg = (c.config ?? {}) as any
    return {
      ...c,
      config: { ...cfg, password: cfg.password ? '••••••••' : '' },
    }
  })
  return NextResponse.json({ data: safe })
}

export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json())
    const created = await prisma.repoConnection.create({
      data: {
        name: body.name,
        type: body.type,
        config: body.config as any,
        status: 'Disconnected',
      },
    })
    return NextResponse.json({ data: { ...created, config: { ...(created.config as any), password: '••••••••' } } }, { status: 201 })
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
