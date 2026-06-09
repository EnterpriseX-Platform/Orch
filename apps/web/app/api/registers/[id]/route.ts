import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateApiSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  endpoint: z.string().min(1).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  backendUrl: z.string().min(1).optional(),
  apiType: z.enum(['REST', 'MICROFLOW']).optional(),
  // Route Type
  routeType: z.enum(['DEDICATED', 'SHARED_ENDPOINT']).optional(),
  routingKey: z.string().nullable().optional(),
  autoDiscoverFormats: z.boolean().optional(),
  // Parent Project
  projectId: z.string().min(1).optional(),
  // Authentication (null = inherit from Project)
  authType: z.enum(['NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC']).nullable().optional(),
  apiKey: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  // Data Catalog (optional)
  dataCatalogId: z.string().nullable().optional(),
  // Rate Limiting
  rateLimitPerMin: z.number().min(1).max(10000).optional(),
  quotaPerDay: z.number().int().positive().nullable().optional(),
  quotaPerMonth: z.number().int().positive().nullable().optional(),
  // Flow Integration
  flowId: z.string().nullable().optional(),
  // Connection Settings
  timeout: z.number().min(1).max(300).optional(),
  retries: z.number().min(0).max(10).optional(),
  // API Information
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  termsOfService: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactUrl: z.string().optional(),
  license: z.string().optional(),
  deprecated: z.boolean().optional(),
  // Status
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'DEPRECATED']).optional(),
})

const detailInclude = {
  project: {
    select: {
      id: true,
      name: true,
      slug: true,
      baseUrl: true,
      authType: true,
    },
  },
  dataCatalog: {
    select: { id: true, name: true, category: true },
  },
  flow: {
    select: { id: true, name: true, triggerType: true },
  },
  creator: {
    select: { id: true, username: true, firstName: true, lastName: true },
  },
  authConfig: true,
  headerMappings: {
    orderBy: { order: 'asc' as const },
  },
  messageFormats: {
    select: {
      id: true,
      name: true,
      discriminatorSource: true,
      discriminatorField: true,
      discriminatorValue: true,
      auditEnabled: true,
      status: true,
    },
  },
  // apiLogs is intentionally NOT a Prisma relation any more — the FK
  // was dropped so logs survive API delete. The GET handler queries
  // logs by apiId in a separate findMany / count below and folds them
  // into the response shape clients expect.
  _count: {
    select: { messageFormats: true },
  },
}

// GET /api/registers/[id] - Get API by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const api = await prisma.apiRegistration.findUnique({
      where: { id },
      include: detailInclude,
    })

    if (!api) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 })
    }

    // Fetch recent logs + total count separately (no FK relation)
    const [recentLogs, logCount] = await Promise.all([
      prisma.apiLog.findMany({
        where: { apiId: id },
        take: 10,
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          method: true,
          path: true,
          statusCode: true,
          duration: true,
          timestamp: true,
        },
      }),
      prisma.apiLog.count({ where: { apiId: id } }),
    ])

    return NextResponse.json({
      ...api,
      apiLogs: recentLogs,
      _count: { ...api._count, apiLogs: logCount },
    })
  } catch (error) {
    console.error('Error fetching API:', error)
    return NextResponse.json({ error: 'Failed to fetch API' }, { status: 500 })
  }
}

// PUT /api/registers/[id] - Update API
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const validated = updateApiSchema.parse(body)

    // Check if API exists
    const existing = await prisma.apiRegistration.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 })
    }

    // Check if project exists (if changing)
    if (validated.projectId && validated.projectId !== existing.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: validated.projectId },
      })
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
    }

    // Check if data catalog exists (if changing)
    if (validated.dataCatalogId && validated.dataCatalogId !== existing.dataCatalogId) {
      const catalog = await prisma.dataCatalog.findUnique({
        where: { id: validated.dataCatalogId },
      })
      if (!catalog) {
        return NextResponse.json({ error: 'Data catalog not found' }, { status: 404 })
      }
    }

    // Check if flow exists (if provided)
    if (validated.flowId) {
      const flow = await prisma.flowIntegration.findUnique({
        where: { id: validated.flowId },
      })
      if (!flow) {
        return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
      }
    }

    const api = await prisma.apiRegistration.update({
      where: { id },
      data: validated,
      include: detailInclude,
    })

    return NextResponse.json(api)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error updating API:', error)
    return NextResponse.json({ error: 'Failed to update API' }, { status: 500 })
  }
}

// DELETE /api/registers/[id] - Delete API
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await prisma.apiRegistration.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 })
    }

    // api_logs has its FK to api_registrations dropped intentionally
    // — logs are append-only history that must survive the deletion
    // of the source API (spec retention compliance). We leave
    // them as orphaned rows; queries can still find them by api_id
    // and the audit trail remains intact for at least 365 days.
    await prisma.apiRegistration.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting API:', error)
    // Surface the underlying message so admins see "FK constraint" /
    // "permission denied" / etc. instead of a generic 500.
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to delete API', details: message }, { status: 500 })
  }
}
