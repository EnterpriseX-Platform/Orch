import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'


const createApiSchema = z.object({
  name: z.string().min(1, 'API name is required'),
  description: z.string().optional(),
  endpoint: z.string().min(1, 'Endpoint is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  backendUrl: z.string().min(1, 'Backend URL is required'),
  apiType: z.enum(['REST', 'MICROFLOW']).default('REST'),
  // Route Type
  routeType: z.enum(['DEDICATED', 'SHARED_ENDPOINT']).default('DEDICATED'),
  routingKey: z.string().optional(), // JSONPath for body-based routing e.g. $.flowName
  autoDiscoverFormats: z.boolean().default(false), // Auto-create message formats from traffic
  // Parent Project (required)
  projectId: z.string().min(1, 'Project is required'),
  // Authentication (null = inherit from Project)
  authType: z.enum(['NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC']).optional(),
  apiKey: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  // Data Catalog (optional)
  dataCatalogId: z.string().optional(),
  // Rate Limiting
  rateLimitPerMin: z.number().min(1).max(10000).default(1000),
  quotaPerDay: z.number().int().positive().nullable().optional(),
  quotaPerMonth: z.number().int().positive().nullable().optional(),
  // Flow Integration
  flowId: z.string().optional(),
  // Connection Settings
  timeout: z.number().min(1).max(300).default(30),
  retries: z.number().min(0).max(10).default(3),
  // API Information (for OpenAPI Spec)
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  termsOfService: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactUrl: z.string().optional(),
  license: z.string().optional(),
  deprecated: z.boolean().default(false),
  // Status
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'DEPRECATED']).default('DRAFT'),
})

// GET /api/registers - List all APIs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') || undefined
    const projectId = searchParams.get('projectId') || undefined
    const dataCatalogId = searchParams.get('dataCatalogId') || undefined
    const search = searchParams.get('search') || undefined

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (dataCatalogId) {
      where.dataCatalogId = dataCatalogId
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { endpoint: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [apis, total] = await Promise.all([
      prisma.apiRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, slug: true },
          },
          dataCatalog: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          flow: {
            select: {
              id: true,
              name: true,
              triggerType: true,
            },
          },
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          // apiLogs is no longer a Prisma relation — count it via
          // a grouped raw query below and merge into _count.
          _count: {
            select: { messageFormats: true },
          },
        },
      }),
      prisma.apiRegistration.count({ where }),
    ])

    // Batched apiLogs count by apiId to fold into each row's _count
    const apiIds = apis.map(a => a.id)
    const logCounts = apiIds.length
      ? await prisma.apiLog.groupBy({
          by: ['apiId'],
          where: { apiId: { in: apiIds } },
          _count: { _all: true },
        })
      : []
    const logCountByApi = new Map(
      logCounts.map(g => [g.apiId, g._count._all] as const),
    )
    const data = apis.map(a => ({
      ...a,
      _count: { ...a._count, apiLogs: logCountByApi.get(a.id) ?? 0 },
    }))

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching APIs:', error)
    return NextResponse.json({ error: 'Failed to fetch APIs' }, { status: 500 })
  }
}

// POST /api/registers - Register new API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validated = createApiSchema.parse(body)

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: validated.projectId },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check if data catalog exists (if provided)
    if (validated.dataCatalogId) {
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

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute API creation' },
        { status: 500 }
      )
    }

    const api = await prisma.apiRegistration.create({
      data: {
        name: validated.name,
        description: validated.description,
        endpoint: validated.endpoint,
        method: validated.method,
        backendUrl: validated.backendUrl,
        apiType: validated.apiType,
        projectId: validated.projectId,
        authType: validated.authType || null,
        apiKey: validated.apiKey,
        apiKeyHeader: validated.apiKeyHeader,
        dataCatalogId: validated.dataCatalogId || null,
        rateLimitPerMin: validated.rateLimitPerMin,
        quotaPerDay: validated.quotaPerDay ?? null,
        quotaPerMonth: validated.quotaPerMonth ?? null,
        flowId: validated.flowId || null,
        timeout: validated.timeout,
        retries: validated.retries,
        version: validated.version,
        tags: validated.tags || [],
        termsOfService: validated.termsOfService,
        contactName: validated.contactName,
        contactEmail: validated.contactEmail,
        contactUrl: validated.contactUrl,
        license: validated.license,
        deprecated: validated.deprecated,
        status: validated.status,
        createdBy: userId,
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
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
      },
    })

    return NextResponse.json(api, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error creating API:', error)
    return NextResponse.json({ error: 'Failed to create API' }, { status: 500 })
  }
}
