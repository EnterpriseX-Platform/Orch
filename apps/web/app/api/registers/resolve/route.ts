import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/registers/resolve?path=&method= - Broker resolver endpoint
// Returns API + messageFormats + authConfig + headerMappings + project config
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const path = searchParams.get('path')
    const method = searchParams.get('method')
    const status = searchParams.get('status') || 'ACTIVE'
    const limit = parseInt(searchParams.get('limit') || '1000')
    const includeFormats = searchParams.get('includeFormats') === 'true'

    // If no path/method, return all active APIs (for broker cache refresh)
    if (!path && !method) {
      const apis = await prisma.apiRegistration.findMany({
        where: { status: status as any },
        take: limit,
        include: {
          project: true,
          messageFormats: {
            where: { status: 'ACTIVE' },
            include: {
              fieldMapping: true,
              auditConfig: true,
              buttons: { include: { screen: true } },
              dataCatalogs: { select: { id: true, name: true, category: true } },
            },
          },
          authConfig: true,
          headerMappings: {
            orderBy: { order: 'asc' },
          },
          flow: {
            select: { id: true, name: true },
          },
        },
      })

      // Substitute ${env.<key>} per-project so broker's by-id cache
      // (populated from this response) gets resolved URLs — without
      // this the cache holds raw template strings and the broker
      // fails forwarding with "relative URL without a base".
      const { loadProjectEnvs, interpolateEnv } = await import('@/lib/env-resolver')
      const envByProject = new Map<string, Map<string, string>>()
      for (const projectId of new Set(apis.map(a => a.projectId).filter(Boolean) as string[])) {
        envByProject.set(projectId, await loadProjectEnvs(projectId))
      }
      const interp = (val: string | null | undefined, projectId: string | null | undefined) =>
        projectId && envByProject.has(projectId)
          ? interpolateEnv(val ?? '', envByProject.get(projectId)!)
          : (val ?? '')

      // Flatten project info into each API for broker consumption
      const result = apis.map((api) => ({
        id: api.id,
        name: api.name,
        endpoint: api.endpoint,
        method: api.method,
        backendUrl: interp(api.backendUrl, api.projectId),
        flowId: api.flowId,
        authType: api.authType,
        apiKey: interp(api.apiKey, api.projectId) || api.apiKey,
        apiKeyHeader: api.apiKeyHeader,
        rateLimitPerMin: api.rateLimitPerMin,
        status: api.status,
        apiType: api.apiType,
        timeout: api.timeout,
        retries: api.retries,
        routeType: api.routeType,
        routingKey: api.routingKey,
        autoDiscoverFormats: api.autoDiscoverFormats,
        // Project-level config
        applicationBaseUrl: interp(api.project?.baseUrl ?? '', api.projectId) || null,
        applicationAuthType: api.project?.authType || null,
        applicationApiKey: interp(api.project?.apiKey ?? '', api.projectId) || api.project?.apiKey || null,
        applicationApiKeyHeader: api.project?.apiKeyHeader || null,
        // Auth config detail
        authConfig: api.authConfig || null,
        // Header mappings
        headerMappings: api.headerMappings || [],
        // Message formats (with audit config)
        messageFormats: api.messageFormats || [],
      }))

      return NextResponse.json({ data: result, total: result.length })
    }

    // Specific path/method lookup
    const apis = await prisma.apiRegistration.findMany({
      where: { status: status as any },
      include: {
        project: true,
        messageFormats: {
          where: { status: 'ACTIVE' },
          include: {
            fieldMapping: true,
            auditConfig: true,
            buttons: { include: { screen: true } },
            dataCatalogs: { select: { id: true, name: true, category: true } },
          },
        },
        authConfig: true,
        headerMappings: {
          orderBy: { order: 'asc' },
        },
      },
    })

    // Find matching API by path pattern
    const matchedApi = apis.find((api) => {
      const methodMatch = !method || api.method === method || method === 'ANY'
      if (!methodMatch) return false
      return pathMatches(api.endpoint, path!)
    })

    if (!matchedApi) {
      return NextResponse.json({ error: 'No matching API found' }, { status: 404 })
    }

    // Substitute ${env.<key>} placeholders in templated URL/credential
    // fields against this project's SystemConfig rows. Lets admins
    // change DEV/SIT/UAT/PROD targets without editing every API or
    // project record. Unknown keys are left as-is so typos are
    // visible in the forwarded URL instead of silently blank.
    const { loadProjectEnvs, interpolateEnv } = await import('@/lib/env-resolver')
    const envs = matchedApi.projectId
      ? await loadProjectEnvs(matchedApi.projectId)
      : new Map<string, string>()

    const apiResolved: any = { ...matchedApi }
    apiResolved.backendUrl = interpolateEnv(matchedApi.backendUrl, envs)
    apiResolved.apiKey = interpolateEnv(matchedApi.apiKey ?? '', envs) || matchedApi.apiKey
    apiResolved.applicationBaseUrl = interpolateEnv(matchedApi.project?.baseUrl ?? '', envs) || null
    apiResolved.applicationAuthType = matchedApi.project?.authType || null

    return NextResponse.json({
      api: apiResolved,
      messageFormats: matchedApi.messageFormats,
    })
  } catch (error) {
    console.error('Error resolving API:', error)
    return NextResponse.json({ error: 'Failed to resolve API' }, { status: 500 })
  }
}

// Path matching logic (same as broker)
function pathMatches(pattern: string, path: string): boolean {
  // Strip query string from both pattern and path before comparing
  const patternPath = pattern.split('?')[0]
  const requestPath = path.split('?')[0]

  // Exact match
  if (patternPath === requestPath) return true

  // Wildcard: /api/v1/* matches /api/v1/anything
  if (patternPath.endsWith('/*')) {
    const prefix = patternPath.slice(0, -2)
    return requestPath === prefix || requestPath.startsWith(prefix + '/')
  }

  // Path params: /api/v1/:id matches /api/v1/123
  const patternParts = patternPath.split('/')
  const pathParts = requestPath.split('/')
  if (patternParts.length !== pathParts.length) return false

  return patternParts.every((part, i) => {
    if (part.startsWith(':')) return true // param matches anything
    return part === pathParts[i]
  })
}
