import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// ==========================================
// Bulk Import ApiRegistration
// POST /api/registers/bulk
//
// Idempotent by (projectId, name) — insert if new, update if exists
// ==========================================

const apiSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  endpoint: z.string().min(1),
  method: z.enum(['GET','POST','PUT','PATCH','DELETE']),
  backendUrl: z.string().min(1),
  apiType: z.enum(['REST','MICROFLOW']).default('REST'),
  routeType: z.enum(['DEDICATED','SHARED_ENDPOINT']).default('DEDICATED'),
  routingKey: z.string().optional(),
  autoDiscoverFormats: z.boolean().default(false),
  // Link by ID or name
  projectId: z.string().optional(),
  projectName: z.string().optional(), // fallback lookup
  // Auth
  authType: z.enum(['NONE','JWT','API_KEY','OAUTH2','BASIC']).optional(),
  apiKey: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  // Limits
  rateLimitPerMin: z.number().min(1).max(100000).default(1000),
  quotaPerDay: z.number().int().positive().nullable().optional(),
  quotaPerMonth: z.number().int().positive().nullable().optional(),
  // Flow
  flowId: z.string().optional(),
  // Connection
  timeout: z.number().min(1).max(300).default(30),
  retries: z.number().min(0).max(10).default(3),
  // Meta
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  deprecated: z.boolean().default(false),
  status: z.enum(['DRAFT','ACTIVE','INACTIVE','DEPRECATED']).default('ACTIVE'),
})

const bulkSchema = z.object({
  dryRun: z.boolean().default(false),
  apis: z.array(apiSchema).min(1).max(200),
})

interface ImportResult {
  name: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  id?: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = bulkSchema.parse(body)

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute bulk API import' },
        { status: 500 }
      )
    }

    const results: ImportResult[] = []
    let created = 0, updated = 0, errors = 0

    // Cache projects for name lookup
    const projects = await prisma.project.findMany({ select: { id: true, name: true } })
    const projectByName = new Map(projects.map(p => [p.name, p]))

    for (const a of validated.apis) {
      try {
        let projectId = a.projectId
        if (!projectId && a.projectName) {
          const p = projectByName.get(a.projectName)
          if (!p) throw new Error(`Project not found: ${a.projectName}`)
          projectId = p.id
        }
        if (!projectId) throw new Error('projectId or projectName required')

        const existing = await prisma.apiRegistration.findFirst({
          where: { projectId, name: a.name },
          select: { id: true },
        })

        const common = {
          description: a.description ?? undefined,
          endpoint: a.endpoint,
          method: a.method,
          backendUrl: a.backendUrl,
          apiType: a.apiType,
          routeType: a.routeType,
          routingKey: a.routingKey ?? undefined,
          autoDiscoverFormats: a.autoDiscoverFormats,
          authType: a.authType ?? undefined,
          apiKey: a.apiKey ?? undefined,
          apiKeyHeader: a.apiKeyHeader ?? undefined,
          rateLimitPerMin: a.rateLimitPerMin,
          quotaPerDay: a.quotaPerDay ?? undefined,
          quotaPerMonth: a.quotaPerMonth ?? undefined,
          timeout: a.timeout,
          retries: a.retries,
          version: a.version ?? undefined,
          tags: a.tags ?? undefined,
          deprecated: a.deprecated,
          status: a.status,
        }

        if (validated.dryRun) {
          results.push({ name: a.name, action: existing ? 'updated' : 'created', id: existing?.id })
          if (existing) updated++
          else created++
          continue
        }

        if (existing) {
          const rec = await prisma.apiRegistration.update({
            where: { id: existing.id },
            data: {
              ...common,
              name: a.name,
              flowId: a.flowId ?? undefined,
            },
            select: { id: true },
          })
          results.push({ name: a.name, action: 'updated', id: rec.id })
          updated++
        } else {
          const rec = await prisma.apiRegistration.create({
            data: {
              ...common,
              name: a.name,
              project: { connect: { id: projectId } },
              creator: { connect: { id: userId } },
              ...(a.flowId ? { flow: { connect: { id: a.flowId } } } : {}),
            },
            select: { id: true },
          })
          results.push({ name: a.name, action: 'created', id: rec.id })
          created++
        }
      } catch (err: any) {
        results.push({ name: a.name, action: 'error', error: err.message || String(err) })
        errors++
      }
    }

    return NextResponse.json({
      dryRun: validated.dryRun,
      summary: { total: validated.apis.length, created, updated, errors },
      results,
    }, { status: errors > 0 ? 207 : 200 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[registers bulk import] error:', error)
    return NextResponse.json({ error: error.message || 'Bulk import failed' }, { status: 500 })
  }
}
