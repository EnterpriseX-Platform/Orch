import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'


const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.string(), z.any()),
})

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
})

const createFlowSchema = z.object({
  name: z.string().min(1, 'Flow name is required'),
  description: z.string().optional(),
  triggerType: z.enum(['HTTP', 'KAFKA_CONSUMER', 'SCHEDULER', 'WEBHOOK', 'MESSAGE_QUEUE']).optional(),
  executionMode: z.enum(['SYNC', 'ASYNC']).optional(),
  flowCategory: z.enum(['API_GATEWAY', 'CONSUMER', 'HYBRID']).optional(),
  executionStrategy: z.string().optional(),
  customQueueConfig: z.record(z.string(), z.any()).optional(),
  nodes: z.array(nodeSchema).min(1, 'At least 1 node is required'),
  edges: z.array(edgeSchema),
  settings: z.record(z.string(), z.any()).optional(),
})

// GET /api/flows - List all flows
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const flowType = searchParams.get('flowType') || undefined
    const status = searchParams.get('status') || undefined // active, inactive
    const search = searchParams.get('search') || undefined

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    if (flowType) {
      where.flowType = flowType
    }

    if (status === 'active') {
      where.isActive = true
    } else if (status === 'inactive') {
      where.isActive = false
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [flows, total] = await Promise.all([
      prisma.flowIntegration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
            select: { 
              apis: true,
              executions: true,
            },
          },
        },
      }),
      prisma.flowIntegration.count({ where }),
    ])

    return NextResponse.json({
      data: flows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching flows:', error)
    return NextResponse.json({ error: 'Failed to fetch flows' }, { status: 500 })
  }
}

// POST /api/flows - Create new flow
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validated = createFlowSchema.parse(body)

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute flow creation' },
        { status: 500 }
      )
    }

    const flow = await prisma.flowIntegration.create({
      data: {
        name: validated.name,
        description: validated.description,
        triggerType: validated.triggerType || 'HTTP',
        executionMode: validated.executionMode || 'SYNC',
        flowCategory: validated.flowCategory || 'API_GATEWAY',
        executionStrategy: validated.executionStrategy || 'fast',
        customQueueConfig: validated.customQueueConfig || undefined,
        nodes: validated.nodes,
        edges: validated.edges,
        settings: validated.settings,
        createdBy: userId,
        isActive: false,
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
        _count: {
          select: { 
            apis: true,
            executions: true,
          },
        },
      },
    })

    return NextResponse.json(flow, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error creating flow:', error)
    return NextResponse.json({ error: 'Failed to create flow' }, { status: 500 })
  }
}
