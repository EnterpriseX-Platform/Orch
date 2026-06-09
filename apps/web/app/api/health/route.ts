import { NextRequest, NextResponse } from 'next/server'

// GET /api/health - Health check endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'orch',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  })
}
