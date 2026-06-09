import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/events - List event logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const eventType = searchParams.get('eventType') || undefined
    const level = searchParams.get('level') || undefined
    const flowId = searchParams.get('flowId') || undefined
    const requestId = searchParams.get('requestId') || undefined

    const skip = (page - 1) * limit

    const where: any = {}

    if (eventType && eventType !== 'ALL') {
      where.eventType = eventType
    } else {
      // pattern_match rows are gateway ACCESS-LOG data (per-request traffic),
      // not business events. Access logs live in /orch/reports (sourced from
      // Loki via the broker access_log stream), so /orch/logs must show only
      // node-emitted events. Exclude pattern_match unless explicitly requested.
      where.eventType = { not: 'pattern_match' }
    }

    if (level && level !== 'ALL') {
      where.level = level
    }

    if (flowId) {
      where.flowId = flowId
    }

    if (requestId) {
      where.requestId = requestId
    }

    const [events, total] = await Promise.all([
      prisma.eventLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.eventLog.count({ where }),
    ])

    return NextResponse.json({
      data: events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching event logs:', error)
    return NextResponse.json({ error: 'Failed to fetch event logs' }, { status: 500 })
  }
}

// POST /api/events - Create event log (from Broker)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Simple validation
    if (!body.eventType || !body.requestId) {
      return NextResponse.json({ 
        error: 'Validation error', 
        details: 'eventType and requestId are required' 
      }, { status: 400 })
    }

    const eventLog = await prisma.eventLog.create({
      data: {
        eventType: body.eventType,
        level: body.level || 'info',
        message: body.message,
        data: body.data || {},
        flowId: body.flowId,
        flowName: body.flowName,
        requestId: body.requestId,
        userId: body.userId,
        userIp: body.userIp,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      },
    })

    return NextResponse.json(eventLog, { status: 201 })
  } catch (error) {
    console.error('Error creating event log:', error)
    return NextResponse.json({ error: 'Failed to create event log' }, { status: 500 })
  }
}
