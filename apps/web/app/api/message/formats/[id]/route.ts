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
  id: z.string(),
  sourceField: z.string(),
  targetField: z.string(),
  fieldType: z.string(),
  description: z.string().optional(),
})

const updateMessageFormatSchema = z.object({
  name: z.string().min(1, 'Message format name is required').optional(),
  description: z.string().optional(),
  apiRegistrationId: z.string().min(1).optional(),
  flowId: z.string().nullable().optional(),
  discriminatorSource: z.enum(['NONE', 'BODY', 'HEADER']).optional(),
  discriminatorField: z.string().optional(),
  discriminatorValue: z.string().optional(),
  matchRules: z.array(z.object({
    source: z.enum(['BODY', 'HEADER']).default('BODY'),
    field: z.string().min(1),
    value: z.string(),
  })).nullable().optional(),
  auditEnabled: z.boolean().optional(),
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
  // Action Context (v2)
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
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'DEPRECATED']).optional(),
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

// GET /api/message/formats/[id] - Get message format by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const messageFormat = await prisma.messageFormat.findUnique({
      where: { id },
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
    })

    if (!messageFormat) {
      return NextResponse.json({ error: 'Message format not found' }, { status: 404 })
    }

    return NextResponse.json(messageFormat)
  } catch (error) {
    console.error('Error fetching message format:', error)
    return NextResponse.json({ error: 'Failed to fetch message format' }, { status: 500 })
  }
}

// PUT /api/message/formats/[id] - Update message format
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const validated = updateMessageFormatSchema.parse(body)

    // Check if message format exists
    const existing = await prisma.messageFormat.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Message format not found' }, { status: 404 })
    }

    // Check if API registration exists (if changing)
    if (validated.apiRegistrationId && validated.apiRegistrationId !== existing.apiRegistrationId) {
      const apiRegistration = await prisma.apiRegistration.findUnique({
        where: { id: validated.apiRegistrationId },
      })

      if (!apiRegistration) {
        return NextResponse.json({ error: 'API Registration not found' }, { status: 404 })
      }
    }

    // If discriminatorSource is being updated, validate the combination
    const finalDiscriminatorSource = validated.discriminatorSource ?? existing.discriminatorSource
    if (finalDiscriminatorSource === 'BODY' || finalDiscriminatorSource === 'HEADER') {
      const finalField = validated.discriminatorField ?? existing.discriminatorField
      const finalValue = validated.discriminatorValue ?? existing.discriminatorValue
      if (!finalField || !finalValue) {
        return NextResponse.json({
          error: 'Validation error',
          details: [{ message: 'discriminatorField and discriminatorValue are required when discriminatorSource is BODY or HEADER' }],
        }, { status: 400 })
      }
    }

    // dataCatalogIds is a virtual field — Prisma needs a relation
    // op (`set`) instead of a scalar assignment. Pull it off the
    // payload first, then re-attach via `dataCatalogs.set` so the
    // M:N junction is overwritten with the new selection.
    const { dataCatalogIds, ...rest } = validated as any
    const dataPatch: any = { ...rest }
    if (Array.isArray(dataCatalogIds)) {
      dataPatch.dataCatalogs = {
        set: dataCatalogIds.map((cid: string) => ({ id: cid })),
      }
    }

    const messageFormat = await prisma.messageFormat.update({
      where: { id },
      data: dataPatch,
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

    return NextResponse.json(messageFormat)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error updating message format:', error)
    return NextResponse.json({ error: 'Failed to update message format' }, { status: 500 })
  }
}

// DELETE /api/message/formats/[id] - Delete message format
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if message format exists
    const existing = await prisma.messageFormat.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Message format not found' }, { status: 404 })
    }

    await prisma.messageFormat.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting message format:', error)
    return NextResponse.json({ error: 'Failed to delete message format' }, { status: 500 })
  }
}
