import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/worker-jobs/by-request/:requestId
// Returns all worker jobs for a given request with overall status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    const jobs = await prisma.workerJob.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    })

    if (jobs.length === 0) {
      return NextResponse.json({
        requestId,
        status: 'NOT_FOUND',
        jobs: [],
        total: 0,
      })
    }

    // Determine overall status from individual jobs
    const overallStatus = determineOverallStatus(jobs)

    // Calculate timing info
    const firstStarted = jobs
      .filter(j => j.startedAt)
      .sort((a, b) => (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0))[0]?.startedAt

    const lastCompleted = jobs
      .filter(j => j.completedAt)
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))[0]?.completedAt

    const durationMs = firstStarted && lastCompleted
      ? lastCompleted.getTime() - firstStarted.getTime()
      : null

    return NextResponse.json({
      requestId,
      status: overallStatus,
      total: jobs.length,
      summary: {
        pending: jobs.filter(j => j.status === 'PENDING').length,
        queued: jobs.filter(j => j.status === 'QUEUED').length,
        processing: jobs.filter(j => j.status === 'PROCESSING').length,
        success: jobs.filter(j => j.status === 'SUCCESS').length,
        failed: jobs.filter(j => j.status === 'FAILED').length,
        retrying: jobs.filter(j => j.status === 'RETRYING').length,
      },
      timing: {
        firstStartedAt: firstStarted,
        lastCompletedAt: lastCompleted,
        totalDurationMs: durationMs,
      },
      jobs,
    })
  } catch (error: any) {
    console.error('Error getting worker jobs by request:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

function determineOverallStatus(jobs: any[]): string {
  if (jobs.length === 0) return 'NOT_FOUND'

  const hasProcessing = jobs.some(j => j.status === 'PROCESSING' || j.status === 'QUEUED')
  const hasPending = jobs.some(j => j.status === 'PENDING')
  const hasFailed = jobs.some(j => j.status === 'FAILED')
  const allSuccess = jobs.every(j => j.status === 'SUCCESS')

  if (allSuccess) return 'COMPLETED'
  if (hasProcessing) return 'PROCESSING'
  if (hasPending) return 'PENDING'
  if (hasFailed) return 'PARTIALLY_FAILED'
  return 'IN_PROGRESS'
}
