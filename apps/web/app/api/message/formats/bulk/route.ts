import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// ==========================================
// Bulk Import MessageFormat
// POST /api/message/formats/bulk
//
// Body:
// {
//   "dryRun": true|false,
//   "formats": [
//     { "code": "SC09-SUBMIT", "name": "...", "apiRegistrationName": "example-microflow", ... },
//     ...
//   ]
// }
//
// Idempotent by (apiRegistrationId, code) — insert if new, update if exists
// ==========================================

const actionTypeEnum = z.enum([
  'READ','SEARCH','CREATE','UPDATE','DELETE','CLONE',
  'SUBMIT','APPROVE','REJECT','SIGNOFF',
  'EXPORT','DOWNLOAD','COMMENT','NOTIFY','OTHER'
]).optional()

const formatSchema = z.object({
  // Identity (required)
  code: z.string().min(1, 'code is required'),
  name: z.string().min(1, 'name is required'),

  // Link — provide one of these to locate the ApiRegistration
  apiRegistrationId: z.string().optional(),
  apiRegistrationName: z.string().optional(), // fallback lookup by name within project
  projectKey: z.string().optional(),          // used with apiRegistrationName

  // Routing
  discriminatorSource: z.enum(['NONE','BODY','HEADER']).default('BODY'),
  discriminatorField: z.string().optional(),
  discriminatorValue: z.string().optional(),

  // Action Context (v2)
  actionType: actionTypeEnum,
  actionLabel: z.string().optional(),

  // Source
  system: z.string().optional(),
  screenCode: z.string().optional(),
  screenName: z.string().optional(),
  tabName: z.string().optional(),

  // Audit
  auditEnabled: z.boolean().default(true),
  pkXPath: z.string().optional(),
  refIdPath: z.string().optional(),
  refNoPath: z.string().optional(),
  userIdPath: z.string().optional(),

  // Meta
  description: z.string().optional(),
  techHints: z.any().optional(),
  flowId: z.string().nullable().optional(),
  formatType: z.enum(['STANDARD','MICROFLOW','BATCH','NOTIFICATION']).optional(),
  status: z.enum(['DRAFT','ACTIVE','INACTIVE','DEPRECATED']).default('ACTIVE'),
})

const bulkSchema = z.object({
  dryRun: z.boolean().default(false),
  formats: z.array(formatSchema).min(1).max(500),
})

interface ImportResult {
  code: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  id?: string
  error?: string
  apiRegistrationId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = bulkSchema.parse(body)

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute bulk message format import' },
        { status: 500 }
      )
    }

    const results: ImportResult[] = []
    let created = 0, updated = 0, errors = 0

    // Pre-cache ApiRegistrations by name for lookup
    const allRegs = await prisma.apiRegistration.findMany({
      select: { id: true, name: true, projectId: true },
    })
    const regByName = new Map(allRegs.map(r => [r.name, r]))

    for (const f of validated.formats) {
      try {
        // Resolve apiRegistrationId
        let apiRegId = f.apiRegistrationId
        if (!apiRegId && f.apiRegistrationName) {
          const found = regByName.get(f.apiRegistrationName)
          if (!found) throw new Error(`ApiRegistration not found: ${f.apiRegistrationName}`)
          apiRegId = found.id
        }
        if (!apiRegId) throw new Error('apiRegistrationId or apiRegistrationName required')

        // Duplicate check by (apiRegId, code)
        const existing = await prisma.messageFormat.findFirst({
          where: { apiRegistrationId: apiRegId, code: f.code },
          select: { id: true },
        })

        const common = {
          name: f.name,
          description: f.description ?? undefined,
          discriminatorSource: f.discriminatorSource,
          discriminatorField: f.discriminatorField ?? undefined,
          discriminatorValue: f.discriminatorValue ?? undefined,
          formatType: f.formatType ?? undefined,
          auditEnabled: f.auditEnabled,
          pkXPath: f.pkXPath ?? undefined,
          refIdPath: f.refIdPath ?? undefined,
          refNoPath: f.refNoPath ?? undefined,
          userIdPath: f.userIdPath ?? undefined,
          code: f.code,
          actionType: f.actionType ?? undefined,
          actionLabel: f.actionLabel ?? undefined,
          system: f.system ?? undefined,
          screenCode: f.screenCode ?? undefined,
          screenName: f.screenName ?? undefined,
          tabName: f.tabName ?? undefined,
          techHints: f.techHints ?? undefined,
          status: f.status,
        }

        if (validated.dryRun) {
          results.push({
            code: f.code,
            action: existing ? 'updated' : 'created',
            id: existing?.id,
            apiRegistrationId: apiRegId,
          })
          if (existing) updated++
          else created++
          continue
        }

        if (existing) {
          const updated_rec = await prisma.messageFormat.update({
            where: { id: existing.id },
            data: {
              ...common,
              ...(f.flowId ? { flow: { connect: { id: f.flowId } } } : {}),
            },
            select: { id: true },
          })
          results.push({ code: f.code, action: 'updated', id: updated_rec.id, apiRegistrationId: apiRegId })
          updated++
        } else {
          const created_rec = await prisma.messageFormat.create({
            data: {
              ...common,
              apiRegistration: { connect: { id: apiRegId } },
              creator: { connect: { id: userId } },
              ...(f.flowId ? { flow: { connect: { id: f.flowId } } } : {}),
            },
            select: { id: true },
          })
          results.push({ code: f.code, action: 'created', id: created_rec.id, apiRegistrationId: apiRegId })
          created++
        }
      } catch (err: any) {
        results.push({
          code: f.code,
          action: 'error',
          error: err.message || String(err),
        })
        errors++
      }
    }

    return NextResponse.json({
      dryRun: validated.dryRun,
      summary: {
        total: validated.formats.length,
        created,
        updated,
        errors,
      },
      results,
    }, { status: errors > 0 ? 207 : 200 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[bulk import] error:', error)
    return NextResponse.json({ error: error.message || 'Bulk import failed' }, { status: 500 })
  }
}
