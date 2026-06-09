// ==========================================
// API Logs - receive logs from orch-broker
// POST /api/logs - Create log entry
// ==========================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/logs - List API logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const apiId = searchParams.get('apiId') || undefined
    const statusCodeParam = searchParams.get('statusCode')
    const statusCode = statusCodeParam ? parseInt(statusCodeParam) : undefined
    const method = searchParams.get('method') || undefined
    const search = searchParams.get('search') || undefined

    const skip = (page - 1) * limit

    const where: any = {}

    if (apiId) where.apiId = apiId
    if (statusCode) where.statusCode = statusCode
    if (method) where.method = method

    if (search) {
      where.OR = [
        { path: { contains: search, mode: 'insensitive' } },
        { requestId: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [logs, total] = await Promise.all([
      prisma.apiLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.apiLog.count({ where }),
    ])

    // Manual join — apiLogs no longer has a Prisma relation to
    // ApiRegistration (FK was dropped so logs survive API delete).
    // We still want { id, name, endpoint } in the response, so look
    // them up in one batched query and merge by apiId. Logs whose
    // source API has been deleted will have api = null.
    const apiIds = Array.from(new Set(logs.map(l => l.apiId).filter(Boolean)))
    const apis = apiIds.length
      ? await prisma.apiRegistration.findMany({
          where: { id: { in: apiIds } },
          select: { id: true, name: true, endpoint: true },
        })
      : []
    const apiById = new Map(apis.map(a => [a.id, a]))
    const data = logs.map(l => ({ ...l, api: apiById.get(l.apiId) ?? null }))

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}

// POST /api/logs - Create log (from orch-broker)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // ⚠️ api_logs PERSISTENCE DISABLED (for now)
    // These access logs aren't consumed by any feature, so we skip the
    // DB write to keep IO light. The CAPTURE is unchanged: the broker's
    // log_api_call still builds + POSTs every proxied request here — we
    // just don't store it. Re-enable by restoring the create block below.
    return NextResponse.json(
      { skipped: true, reason: 'api_logs persistence disabled', received: !!body },
      { status: 200 },
    )

    /* RE-ENABLE to persist api_logs again:
    const log = await prisma.apiLog.create({
      data: {
        requestId: body.requestId || crypto.randomUUID(),
        apiId: body.apiId,
        method: body.method,
        path: body.path,
        statusCode: body.statusCode || 200,
        duration: body.duration || 0,
        userIp: body.userIp,
        userAgent: body.userAgent,
        requestHeaders: body.requestHeaders,
        requestBody: body.requestBody,
        responseHeaders: body.responseHeaders,
        responseBody: body.responseBody,
        extractedData: body.extractedData,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      },
    })
    return NextResponse.json(log, { status: 201 })
    */
  } catch (error) {
    console.error('Error creating log:', error)
    return NextResponse.json({ error: 'Failed to create log' }, { status: 500 })
  }
}
