import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/status/:requestId - Check async request status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    // Fetch request status from database
    // In production, a separate table should be used to store async request status
    // or use Redis for temporary data storage
    
    const execution = await prisma.flowExecution.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    })

    if (!execution) {
      return NextResponse.json(
        { 
          requestId,
          status: 'not_found',
          message: 'Request not found or expired'
        },
        { status: 404 }
      )
    }

    // Map execution status to response
    const response = {
      requestId,
      status: execution.status.toLowerCase(),
      createdAt: execution.createdAt,
      completedAt: execution.completedAt,
      duration: execution.duration,
      result: execution.outputData,
      error: execution.errorMessage,
      // TTL info
      expiresAt: new Date(execution.createdAt.getTime() + 30 * 60 * 1000), // 30 min TTL
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching request status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch request status' },
      { status: 500 }
    )
  }
}
