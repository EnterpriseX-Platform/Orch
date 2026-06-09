import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    // Find flow executions matching the requestId
    const executions = await prisma.flowExecution.findMany({
      where: {
        inputData: {
          path: ['requestId'],
          equals: requestId
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: 10
    })

    if (executions.length === 0) {
      return NextResponse.json({
        requestId,
        status: 'NOT_FOUND',
        message: 'No executions found for this request ID'
      }, { status: 404 })
    }

    // Aggregate results from all executions
    const latestExecution = executions[0]
    const allCompleted = executions.every(e => 
      e.status === 'SUCCESS' || e.status === 'FAILED'
    )
    
    return NextResponse.json({
      requestId,
      status: allCompleted ? 'COMPLETED' : 'PROCESSING',
      executions: executions.map(e => ({
        id: e.id,
        flowId: e.flowId,
        status: e.status,
        inputData: e.inputData,
        outputData: e.outputData,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        duration: e.duration
      })),
      completedAt: allCompleted ? latestExecution.completedAt : null
    })
  } catch (error) {
    console.error('Error fetching job status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}
