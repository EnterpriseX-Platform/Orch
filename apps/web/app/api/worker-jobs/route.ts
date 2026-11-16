import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, featureGuard, tenantWhere } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'

// POST /api/worker-jobs - Create or update a worker job result (from broker)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantContext(request)
    const blocked = featureGuard(ctx, 'flows')
    if (blocked) return blocked
    const body = await request.json()

    const {
      id,
      requestId,
      flowId,
      nodeId,
      nodeType,
      queueName = 'default',
      priority = 0,
      status = 'PENDING',
      inputData,
      outputData,
      config,
      maxRetries = 3,
      retryCount = 0,
      errorMessage,
      startedAt,
      completedAt,
      kafkaOffset,
      kafkaPartition,
    } = body

    if (!id || !requestId || !flowId || !nodeId || !nodeType) {
      return NextResponse.json(
        { error: 'Missing required fields: id, requestId, flowId, nodeId, nodeType' },
        { status: 400 }
      )
    }

    // Map status string to Prisma enum
    const statusMap: Record<string, string> = {
      'Pending': 'PENDING',
      'Queued': 'QUEUED',
      'Processing': 'PROCESSING',
      'Success': 'SUCCESS',
      'Failed': 'FAILED',
      'Retrying': 'RETRYING',
      'Cancelled': 'CANCELLED',
      // Also accept uppercase directly
      'PENDING': 'PENDING',
      'QUEUED': 'QUEUED',
      'PROCESSING': 'PROCESSING',
      'SUCCESS': 'SUCCESS',
      'FAILED': 'FAILED',
      'RETRYING': 'RETRYING',
      'CANCELLED': 'CANCELLED',
    }

    const mappedStatus = statusMap[status] || 'PENDING'

    // Upsert: create or update
    const job = await prisma.workerJob.upsert({
      where: { id },
      create: {
        id,
        requestId,
        flowId,
        nodeId,
        nodeType,
        queueName,
        priority,
        status: mappedStatus as any,
        inputData: inputData || {},
        outputData: outputData || undefined,
        config: config || undefined,
        maxRetries,
        retryCount,
        errorMessage: errorMessage || undefined,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        completedAt: completedAt ? new Date(completedAt) : undefined,
        kafkaOffset: kafkaOffset || undefined,
        kafkaPartition: kafkaPartition || undefined,
      },
      update: {
        status: mappedStatus as any,
        outputData: outputData || undefined,
        retryCount,
        errorMessage: errorMessage || undefined,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        completedAt: completedAt ? new Date(completedAt) : undefined,
        kafkaOffset: kafkaOffset || undefined,
        kafkaPartition: kafkaPartition || undefined,
      },
    })

    return NextResponse.json({ success: true, job })
  } catch (error: any) {
    console.error('Error saving worker job:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/worker-jobs - List worker jobs with filters
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantContext(request)
    const blocked = featureGuard(ctx, 'flows')
    if (blocked) return blocked
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const requestId = searchParams.get('requestId') || undefined
    const flowId = searchParams.get('flowId') || undefined
    const status = searchParams.get('status') || undefined
    const queueName = searchParams.get('queueName') || undefined
    const nodeType = searchParams.get('nodeType') || undefined

    const skip = (page - 1) * limit

    const where: any = {}

    if (requestId) where.requestId = requestId
    if (flowId) where.flowId = flowId
    if (status) where.status = status
    if (queueName) where.queueName = queueName
    if (nodeType) where.nodeType = nodeType
    const tenantFlowIds = (ctx.tenantId ? (await prisma.flowIntegration.findMany({ where: tenantWhere(ctx), select: { id: true } })).map((f) => f.id) : null)
    if (tenantFlowIds) where.AND = [{ flowId: { in: tenantFlowIds } }]

    const [jobs, total] = await Promise.all([
      prisma.workerJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.workerJob.count({ where }),
    ])

    return NextResponse.json({
      data: jobs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: any) {
    console.error('Error listing worker jobs:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
