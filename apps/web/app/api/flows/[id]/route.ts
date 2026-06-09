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

const updateFlowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  triggerType: z.enum(['HTTP', 'KAFKA_CONSUMER', 'SCHEDULER', 'WEBHOOK', 'MESSAGE_QUEUE']).optional(),
  executionMode: z.enum(['SYNC', 'ASYNC']).optional(),
  flowCategory: z.enum(['API_GATEWAY', 'CONSUMER', 'HYBRID']).optional(),
  executionStrategy: z.string().optional(),
  customQueueConfig: z.record(z.string(), z.any()).optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
})

// GET /api/flows/[id] - Get flow by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const flow = await prisma.flowIntegration.findUnique({
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
            status: true,
          },
        },
        executions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!flow) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    }

    return NextResponse.json(flow)
  } catch (error) {
    console.error('Error fetching flow:', error)
    return NextResponse.json({ error: 'Failed to fetch flow' }, { status: 500 })
  }
}

// PUT /api/flows/[id] - Update flow
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const validated = updateFlowSchema.parse(body)

    // Check if flow exists
    const existing = await prisma.flowIntegration.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    }

    const flow = await prisma.flowIntegration.update({
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
        apis: {
          select: {
            id: true,
            name: true,
            endpoint: true,
            status: true,
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

    return NextResponse.json(flow)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error updating flow:', error)
    return NextResponse.json({ error: 'Failed to update flow' }, { status: 500 })
  }
}

// DELETE /api/flows/[id] - Delete flow
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if flow exists
    const existing = await prisma.flowIntegration.findUnique({
      where: { id },
      include: {
        _count: {
          select: { apis: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    }

    // Check if flow has associated APIs
    if (existing._count.apis > 0) {
      return NextResponse.json({ error: 'Cannot delete flow with associated APIs' }, { status: 400 })
    }

    await prisma.flowIntegration.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting flow:', error)
    return NextResponse.json({ error: 'Failed to delete flow' }, { status: 500 })
  }
}
