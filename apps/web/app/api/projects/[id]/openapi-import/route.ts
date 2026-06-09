/**
 * POST /api/projects/:id/openapi-import
 *
 * Accepts an OpenAPI 3.x spec (JSON) and creates ApiRegistration
 * entries under the given project. Idempotent: if an API with the
 * same (endpoint, method) already exists, it's left alone.
 *
 * Input body: { spec: <full OpenAPI JSON>, backendUrl?: string }
 *   backendUrl overrides `servers[0].url` from the spec — useful
 *   when the spec's public URL differs from the internal one the
 *   broker should proxy to (common behind an API gateway).
 *
 * For every path × method in the spec:
 *   - endpoint = "/<projectSlug>" + path
 *   - backendUrl = (input.backendUrl || servers[0].url) + path
 *   - tags = operation.tags[] (comma-joined)
 *   - description = operation.summary || operation.description
 *
 * Response: { created: n, skipped: n, details: [...] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth'
import type { HttpMethod } from '@/types'

interface OpenApiOperation {
  summary?: string
  description?: string
  tags?: string[]
  operationId?: string
}
interface OpenApiSpec {
  openapi?: string
  info?: { title?: string }
  servers?: Array<{ url: string }>
  paths?: Record<string, Record<string, OpenApiOperation>>
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
type Method = (typeof METHODS)[number]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const body = await req.json().catch(() => null)
  const spec: OpenApiSpec | undefined = body?.spec
  const overrideBackend: string | undefined = body?.backendUrl

  if (!spec || typeof spec !== 'object' || !spec.paths) {
    return NextResponse.json({ error: 'Missing or invalid OpenAPI spec' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const userId = await resolveUserId(req.headers.get('x-user-id'))
  if (!userId) return NextResponse.json({ error: 'No usable user for createdBy' }, { status: 500 })

  const baseServerUrl = (overrideBackend || spec.servers?.[0]?.url || '').replace(/\/$/, '')

  const details: Array<{ endpoint: string; method: string; action: 'created' | 'skipped'; reason?: string }> = []
  let created = 0
  let skipped = 0

  for (const [rawPath, methodsMap] of Object.entries(spec.paths)) {
    for (const m of Object.keys(methodsMap || {})) {
      if (!METHODS.includes(m as Method)) continue
      const op = (methodsMap as Record<string, OpenApiOperation>)[m]
      const method = m.toUpperCase() as HttpMethod
      const endpoint = `/${project.slug}${rawPath.startsWith('/') ? rawPath : '/' + rawPath}`
      const backendUrl = baseServerUrl
        ? `${baseServerUrl}${rawPath.startsWith('/') ? rawPath : '/' + rawPath}`
        : ''

      // Idempotency: skip if an ApiRegistration already owns this
      // (endpoint, method) pair for this project.
      const existing = await prisma.apiRegistration.findFirst({
        where: { projectId, endpoint, method },
        select: { id: true },
      })
      if (existing) {
        skipped++
        details.push({ endpoint, method, action: 'skipped', reason: 'exists' })
        continue
      }

      const name = op.operationId || `${method} ${rawPath}`
      const description = op.summary || op.description || undefined
      const tags = Array.isArray(op.tags) ? op.tags : []

      try {
        await prisma.apiRegistration.create({
          data: {
            name,
            description,
            endpoint,
            method,
            backendUrl: backendUrl || '',
            apiType: 'REST',
            routeType: 'DEDICATED',
            status: 'DRAFT',
            rateLimitPerMin: 1000,
            timeout: 30,
            retries: 3,
            tags: tags.length ? tags : undefined,
            project: { connect: { id: projectId } },
            creator: { connect: { id: userId } },
          },
        })
        created++
        details.push({ endpoint, method, action: 'created' })
      } catch (e) {
        skipped++
        details.push({
          endpoint, method, action: 'skipped',
          reason: e instanceof Error ? e.message : 'create failed',
        })
      }
    }
  }

  return NextResponse.json({ created, skipped, total: created + skipped, details })
}
