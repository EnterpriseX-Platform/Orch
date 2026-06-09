/**
 * /api/screens — CRUD for the Screen catalog.
 *
 * Each Screen has many ScreenButtons; each ScreenButton may bind to
 * a MessageFormat (many buttons → one format). Detection rules on
 * ScreenButton drive runtime call-site matching at the gateway.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  system: z.string().optional().nullable(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId') || undefined
  const clientId  = req.nextUrl.searchParams.get('clientId')  || undefined
  const system    = req.nextUrl.searchParams.get('system')    || undefined
  const items = await prisma.screen.findMany({
    where: {
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
      ...(clientId  ? { clientId } : {}),
      ...(system    ? { system   } : {}),
    },
    orderBy: [{ system: 'asc' }, { code: 'asc' }],
    include: {
      buttons: {
        include: { messageFormat: { select: { id: true, name: true, code: true, actionType: true } } },
        orderBy: { buttonLabel: 'asc' },
      },
      client: { select: { id: true, name: true, appCode: true } },
    },
  })
  return NextResponse.json({ data: items })
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    const created = await prisma.screen.create({ data: body })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
