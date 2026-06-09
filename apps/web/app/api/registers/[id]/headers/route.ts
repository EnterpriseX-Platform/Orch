import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const headerMappingSchema = z.object({
  direction: z.enum(['REQUEST', 'RESPONSE']),
  headerName: z.string().min(1, 'Header name is required'),
  headerValue: z.string().min(1, 'Header value is required'),
  action: z.enum(['SET', 'APPEND', 'REMOVE', 'PASSTHROUGH']).default('SET'),
  condition: z.string().optional(),
  order: z.number().int().default(0),
})

// GET /api/registers/[id]/headers
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const mappings = await prisma.apiHeaderMapping.findMany({
      where: { apiRegistrationId: id },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json({ data: mappings })
  } catch (error) {
    console.error('Error fetching header mappings:', error)
    return NextResponse.json({ error: 'Failed to fetch header mappings' }, { status: 500 })
  }
}

// POST /api/registers/[id]/headers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validated = headerMappingSchema.parse(body)

    // Check API exists
    const api = await prisma.apiRegistration.findUnique({ where: { id } })
    if (!api) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 })
    }

    const mapping = await prisma.apiHeaderMapping.create({
      data: {
        ...validated,
        apiRegistrationId: id,
      },
    })

    return NextResponse.json(mapping, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error creating header mapping:', error)
    return NextResponse.json({ error: 'Failed to create header mapping' }, { status: 500 })
  }
}

// PUT /api/registers/[id]/headers - Bulk update (replace all)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const mappings = z.array(headerMappingSchema.extend({ id: z.string().optional() })).parse(body.mappings || body)

    // Check API exists
    const api = await prisma.apiRegistration.findUnique({ where: { id } })
    if (!api) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 })
    }

    // Delete all existing and recreate (transaction)
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiHeaderMapping.deleteMany({ where: { apiRegistrationId: id } })
      const created = await Promise.all(
        mappings.map((m, index) =>
          tx.apiHeaderMapping.create({
            data: {
              direction: m.direction,
              headerName: m.headerName,
              headerValue: m.headerValue,
              action: m.action,
              condition: m.condition,
              order: m.order ?? index,
              apiRegistrationId: id,
            },
          })
        )
      )
      return created
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error updating header mappings:', error)
    return NextResponse.json({ error: 'Failed to update header mappings' }, { status: 500 })
  }
}

// DELETE /api/registers/[id]/headers - Delete single by headerId query param
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const headerId = request.nextUrl.searchParams.get('headerId')

    if (!headerId) {
      return NextResponse.json({ error: 'headerId query param required' }, { status: 400 })
    }

    const existing = await prisma.apiHeaderMapping.findFirst({
      where: { id: headerId, apiRegistrationId: id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Header mapping not found' }, { status: 404 })
    }

    await prisma.apiHeaderMapping.delete({ where: { id: headerId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting header mapping:', error)
    return NextResponse.json({ error: 'Failed to delete header mapping' }, { status: 500 })
  }
}
