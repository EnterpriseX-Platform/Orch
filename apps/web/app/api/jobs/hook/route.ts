import { NextRequest, NextResponse } from 'next/server'

/**
 * Webhook endpoint for Worker to call back when a Job is complete
 * Reduces load by eliminating polling/database polling
 */

// In-memory cache for recent completions
const recentCompletions = new Map<string, any>()
const COMPLETION_TTL = 5 * 60 * 1000 // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { request_id, job_id, status, output_data, error_message } = body

    // Store in memory cache
    recentCompletions.set(request_id, {
      requestId: request_id,
      jobId: job_id,
      status,
      outputData: output_data,
      errorMessage: error_message,
      receivedAt: Date.now()
    })

    // Cleanup old entries
    const now = Date.now()
    for (const [key, value] of recentCompletions.entries()) {
      if (now - value.receivedAt > COMPLETION_TTL) {
        recentCompletions.delete(key)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// For clients to check if result is available
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const requestId = searchParams.get('requestId')

  if (!requestId) {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 })
  }

  // Check memory cache first
  const cached = recentCompletions.get(requestId)
  if (cached) {
    return NextResponse.json({ source: 'cache', data: cached })
  }

  return NextResponse.json({ status: 'pending' }, { status: 202 })
}
