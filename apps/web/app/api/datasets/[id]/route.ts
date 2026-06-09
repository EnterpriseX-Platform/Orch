import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateDatasetSchema = z.object({
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  category: z.enum([
    'TRANSACTIONAL',
    'RESERVED',
    'TRANSFER',
    'PERFORMANCE',
    'EXPENDITURE',
    'PROCUREMENT',
    'MASTER_DATA',
    'OTHER',
  ]).optional(),
  subCategory: z.string().optional(),
  schema: z.record(z.string(), z.any()).optional(),
  sampleData: z.record(z.string(), z.any()).optional(),
  updateFrequency: z.string().optional(),
  dataOwner: z.string().optional(),
  contactInfo: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']).optional(),
  isPublic: z.boolean().optional(),
})

// GET /api/datasets/[id] - Get dataset by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const dataset = await prisma.dataCatalog.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        apis: {
          select: {
            id: true,
            name: true,
            endpoint: true,
            method: true,
            status: true,
          },
        },
      },
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    return NextResponse.json(dataset)
  } catch (error) {
    console.error('Error fetching dataset:', error)
    return NextResponse.json({ error: 'Failed to fetch dataset' }, { status: 500 })
  }
}

// PUT /api/datasets/[id] - Update dataset
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const validated = updateDatasetSchema.parse(body)

    // Check if dataset exists
    const existing = await prisma.dataCatalog.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    const dataset = await prisma.dataCatalog.update({
      where: { id },
      data: validated,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    return NextResponse.json(dataset)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error updating dataset:', error)
    return NextResponse.json({ error: 'Failed to update dataset' }, { status: 500 })
  }
}

// DELETE /api/datasets/[id] - Delete dataset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if dataset exists
    const existing = await prisma.dataCatalog.findUnique({
      where: { id },
      include: {
        _count: {
          select: { apis: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Check if dataset has associated APIs
    if (existing._count.apis > 0) {
      return NextResponse.json({ error: 'Cannot delete dataset with associated APIs' }, { status: 400 })
    }

    await prisma.dataCatalog.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting dataset:', error)
    return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 })
  }
}
