import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'


const createDatasetSchema = z.object({
  name: z.string().min(1, 'Dataset name is required'),
  nameEn: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional().default(''),
  category: z.enum([
    'TRANSACTIONAL',
    'RESERVED',
    'TRANSFER',
    'PERFORMANCE',
    'EXPENDITURE',
    'PROCUREMENT',
    'MASTER_DATA',
    'OTHER',
  ]).optional().default('OTHER'),
  subCategory: z.string().optional(),
  schema: z.record(z.string(), z.any()).optional(),
  sampleData: z.record(z.string(), z.any()).optional(),
  updateFrequency: z.string().optional(),
  dataOwner: z.string().optional(),
  contactInfo: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']).optional().default('DRAFT'),
  isPublic: z.boolean().optional().default(false),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
})

// Helper function to build tree structure (sorted by sortOrder)
function buildTree(items: any[], parentId: string | null = null): any[] {
  return items
    .filter(item => item.parentId === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(item => ({
      ...item,
      children: buildTree(items, item.id),
    }))
}

// GET /api/datasets - List all datasets (hierarchical)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const category = searchParams.get('category') || undefined
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined
    const tree = searchParams.get('tree') === 'true' // Return as tree structure

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    if (category) {
      where.category = category
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [datasets, total] = await Promise.all([
      prisma.dataCatalog.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: { apis: true },
          },
        },
      }),
      prisma.dataCatalog.count({ where }),
    ])

    // Return as tree if requested
    const responseData = tree ? buildTree(datasets) : datasets

    return NextResponse.json({
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching datasets:', error)
    return NextResponse.json({ error: 'Failed to fetch datasets' }, { status: 500 })
  }
}

// POST /api/datasets - Create new dataset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validated = createDatasetSchema.parse(body)

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute dataset creation' },
        { status: 500 }
      )
    }

    // Validate parent exists if provided
    if (validated.parentId) {
      const parent = await prisma.dataCatalog.findUnique({
        where: { id: validated.parentId },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent dataset not found' }, { status: 404 })
      }
    }

    // Auto-assign sortOrder if not provided: max + 1 among siblings
    let sortOrder = validated.sortOrder
    if (sortOrder === undefined || sortOrder === null) {
      const maxSibling = await prisma.dataCatalog.findFirst({
        where: { parentId: validated.parentId ?? null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      sortOrder = (maxSibling?.sortOrder ?? 0) + 1
    }

    const dataset = await prisma.dataCatalog.create({
      data: {
        ...validated,
        sortOrder,
        createdBy: userId,
      },
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

    return NextResponse.json(dataset, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error creating dataset:', error)
    return NextResponse.json({ error: 'Failed to create dataset' }, { status: 500 })
  }
}
