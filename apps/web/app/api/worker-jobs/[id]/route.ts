import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, featureGuard, isForeign, flowAllowed } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'

// GET /api/worker-jobs/:id - Get single worker job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenantContext(request)
    const blocked = featureGuard(ctx, 'flows')
    if (blocked) return blocked
    const { id } = await params

    const job = await prisma.workerJob.findUnique({
      where: { id },
    })

    const jobFlow = job && ctx.tenantId
      ? await prisma.flowIntegration.findUnique({ where: { id: job.flowId }, select: { tenantId: true } })
      : null
    if (!job || (ctx.tenantId && (!jobFlow || isForeign(ctx, jobFlow)))) {
      return NextResponse.json(
        { error: 'Worker job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, job })
  } catch (error: any) {
    console.error('Error getting worker job:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/worker-jobs/:id - Update worker job status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenantContext(request)
    const blocked = featureGuard(ctx, 'flows')
    if (blocked) return blocked
    const { id } = await params
    if (ctx.tenantId) {
      const existing = await prisma.workerJob.findUnique({ where: { id }, select: { flowId: true } })
      if (existing && !(await flowAllowed(ctx, existing.flowId))) {
        return NextResponse.json({ error: 'Worker job not found' }, { status: 404 })
      }
    }
    const body = await request.json()

    const updateData: any = {}

    if (body.status) updateData.status = body.status
    if (body.outputData !== undefined) updateData.outputData = body.outputData
    if (body.errorMessage !== undefined) updateData.errorMessage = body.errorMessage
    if (body.retryCount !== undefined) updateData.retryCount = body.retryCount
    if (body.startedAt) updateData.startedAt = new Date(body.startedAt)
    if (body.completedAt) updateData.completedAt = new Date(body.completedAt)
    if (body.kafkaOffset) updateData.kafkaOffset = body.kafkaOffset
    if (body.kafkaPartition) updateData.kafkaPartition = body.kafkaPartition

    const job = await prisma.workerJob.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, job })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Worker job not found' },
        { status: 404 }
      )
    }
    console.error('Error updating worker job:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
