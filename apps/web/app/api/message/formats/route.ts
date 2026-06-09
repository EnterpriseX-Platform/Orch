import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const auditFieldSchema = z.object({
  id: z.string(),
  fieldName: z.string(),
  fieldPath: z.string(),
  fieldType: z.string(),
  description: z.string().optional(),
  sensitive: z.boolean().optional(),
  required: z.boolean().optional(),
})

const fieldMappingSchema = z.object({
  fieldName: z.string().optional(),
  fieldPath: z.string().optional(),
  fieldType: z.string().optional(),
  sensitive: z.boolean().optional(),
  // Legacy fields
  id: z.string().optional(),
  sourceField: z.string().optional(),
  targetField: z.string().optional(),
  description: z.string().optional(),
}).passthrough()

const createMessageFormatSchema = z.object({
  name: z.string().min(1, 'Message format name is required'),
  description: z.string().optional(),
  apiRegistrationId: z.string().min(1, 'API registration is required'),
  flowId: z.string().nullable().optional(),
  discriminatorSource: z.enum(['NONE', 'BODY', 'HEADER']).default('NONE'),
  discriminatorField: z.string().optional(),
  discriminatorValue: z.string().optional(),
  // Optional AND-rules layered on top of the primary discriminator.
  matchRules: z.array(z.object({
    source: z.enum(['BODY', 'HEADER']).default('BODY'),
    field: z.string().min(1),
    value: z.string(),
  })).nullable().optional(),
  auditEnabled: z.boolean().default(true),
  auditFields: z.any().optional(),
  pkXPath: z.string().optional(),
  extractionConfig: z.any().optional(),
  fieldMappings: z.any().optional(),
  formatType: z.enum(['STANDARD', 'MICROFLOW', 'BATCH', 'NOTIFICATION']).optional(),
  refIdPath: z.string().optional(),
  refNoPath: z.string().optional(),
  userIdPath: z.string().optional(),
  sourcePage: z.string().optional(),
  sourceFunction: z.string().optional(),
  sourceButton: z.string().optional(),
  sourceSystem: z.string().optional(),
  // NEW — Action Context (v2)
  code: z.string().optional(),
  actionType: z.enum([
    'READ','SEARCH','CREATE','UPDATE','DELETE','CLONE',
    'SUBMIT','APPROVE','REJECT','SIGNOFF',
    'EXPORT','DOWNLOAD','COMMENT','NOTIFY','OTHER'
  ]).optional(),
  actionLabel: z.string().optional(),
  system: z.string().optional(),
  screenCode: z.string().optional(),
  screenName: z.string().optional(),
  tabName: z.string().optional(),
  techHints: z.any().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'DEPRECATED']).default('DRAFT'),
  // Library refs + override fields (Phase 4)
  fieldMappingId: z.string().nullable().optional(),
  auditConfigId:  z.string().nullable().optional(),
  isDefault:      z.boolean().optional(),
  refType:        z.string().nullable().optional(),
  refNamePath:    z.string().nullable().optional(),
  usernameSource: z.enum(['BODY_PATH', 'HEADER', 'JWT_CLAIM', 'SESSION', 'STATIC']).nullable().optional(),
  usernameField:  z.string().nullable().optional(),
  usernameStatic: z.string().nullable().optional(),
  // spec — JSONPath strings to redact before audit write
  maskPaths:      z.array(z.string()).nullable().optional(),
  // spec — DataCatalog ids this format reads/writes (M:N)
  dataCatalogIds: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.discriminatorSource === 'BODY' || data.discriminatorSource === 'HEADER') {
      return !!data.discriminatorField && !!data.discriminatorValue
    }
    return true
  },
  {
    message: 'discriminatorField and discriminatorValue are required when discriminatorSource is BODY or HEADER',
    path: ['discriminatorField'],
  }
)

// GET /api/message/formats - List all message formats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') || undefined
    const apiRegistrationId = searchParams.get('apiRegistrationId') || undefined
    const search = searchParams.get('search') || undefined

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (apiRegistrationId) {
      where.apiRegistrationId = apiRegistrationId
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [messageFormats, total] = await Promise.all([
      prisma.messageFormat.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          apiRegistration: {
            select: {
              id: true,
              name: true,
              endpoint: true,
              method: true,
            },
          },
          flow: {
            select: { id: true, name: true, triggerType: true },
          },
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.messageFormat.count({ where }),
    ])

    return NextResponse.json({
      data: messageFormats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching message formats:', error)
    return NextResponse.json({ error: 'Failed to fetch message formats' }, { status: 500 })
  }
}

// POST /api/message/formats - Create new message format
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validated = createMessageFormatSchema.parse(body)

    // Check if API registration exists
    const apiRegistration = await prisma.apiRegistration.findUnique({
      where: { id: validated.apiRegistrationId },
    })

    if (!apiRegistration) {
      return NextResponse.json({ error: 'API Registration not found' }, { status: 404 })
    }

    // Duplicate check: if same apiRegistrationId + discriminatorValue already exists, return existing
    if (validated.discriminatorValue) {
      const existing = await prisma.messageFormat.findFirst({
        where: {
          apiRegistrationId: validated.apiRegistrationId,
          discriminatorValue: validated.discriminatorValue,
          status: 'ACTIVE',
        },
        include: {
          apiRegistration: {
            select: { id: true, name: true, endpoint: true, method: true },
          },
        },
      })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    const rawUserId = getUserId(request)
    const userId = await resolveUserId(rawUserId)
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user to attribute the message format to (empty users table?)' },
        { status: 500 },
      )
    }

    const messageFormat = await prisma.messageFormat.create({
      data: {
        name: validated.name,
        description: validated.description,
        apiRegistrationId: validated.apiRegistrationId,
        flowId: validated.flowId ?? undefined,
        discriminatorSource: validated.discriminatorSource,
        discriminatorField: validated.discriminatorField,
        discriminatorValue: validated.discriminatorValue,
        matchRules: validated.matchRules ?? undefined,
        formatType: validated.formatType ?? undefined,
        auditEnabled: validated.auditEnabled,
        auditFields: validated.auditFields ?? undefined,
        pkXPath: validated.pkXPath,
        extractionConfig: validated.extractionConfig ?? undefined,
        fieldMappings: validated.fieldMappings ?? undefined,
        refIdPath: validated.refIdPath ?? undefined,
        refNoPath: validated.refNoPath ?? undefined,
        userIdPath: validated.userIdPath ?? undefined,
        sourcePage: validated.sourcePage ?? undefined,
        sourceFunction: validated.sourceFunction ?? undefined,
        sourceButton: validated.sourceButton ?? undefined,
        sourceSystem: validated.sourceSystem ?? undefined,
        // NEW v2 fields
        code: validated.code ?? undefined,
        actionType: validated.actionType ?? undefined,
        actionLabel: validated.actionLabel ?? undefined,
        system: validated.system ?? undefined,
        screenCode: validated.screenCode ?? undefined,
        screenName: validated.screenName ?? undefined,
        tabName: validated.tabName ?? undefined,
        techHints: validated.techHints ?? undefined,
        status: validated.status,
        // spec
        maskPaths: validated.maskPaths ?? undefined,
        ...(validated.dataCatalogIds?.length
          ? { dataCatalogs: { connect: validated.dataCatalogIds.map(id => ({ id })) } }
          : {}),
        createdBy: userId,
      } as any,
      include: {
        apiRegistration: {
          select: {
            id: true,
            name: true,
            endpoint: true,
            method: true,
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
      },
    })

    return NextResponse.json(messageFormat, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error creating message format:', error)
    return NextResponse.json({ error: 'Failed to create message format' }, { status: 500 })
  }
}
