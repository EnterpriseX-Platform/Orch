import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/projects/resolve-by-path?path=/service-center/payments/123
// Resolves a request path to a Project by pathPrefix matching
// Used by the broker for fallback routing when no API Registration matches
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json(
        { error: 'path parameter is required' },
        { status: 400 }
      )
    }

    // Find all active projects that have a pathPrefix configured
    const projects = await prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        pathPrefix: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        baseUrl: true,
        proxyTargetUrl: true,
        pathPrefix: true,
        authType: true,
        apiKey: true,
        apiKeyHeader: true,
        oidcEnabled: true,
        oidcIssuerUrl: true,
        oidcClientId: true,
        oidcJwksUrl: true,
        oidcRequiredScopes: true,
      },
      orderBy: {
        // Order by pathPrefix length descending for most-specific match
        pathPrefix: 'desc',
      },
    })

    // Find the best matching project by pathPrefix
    // Longest prefix match wins (most specific)
    let bestMatch = null
    let bestPrefixLen = 0

    for (const project of projects) {
      const prefix = project.pathPrefix
      if (!prefix) continue

      // Normalize: ensure prefix starts with /
      const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`

      // Check if path starts with this prefix
      if (path.startsWith(normalizedPrefix) || path.startsWith(normalizedPrefix + '/')) {
        if (normalizedPrefix.length > bestPrefixLen) {
          bestMatch = project
          bestPrefixLen = normalizedPrefix.length
        }
      }
    }

    if (!bestMatch) {
      return NextResponse.json({
        found: false,
        path,
        message: 'No project matches the given path prefix',
      })
    }

    // Calculate the remaining path after stripping the prefix
    const normalizedPrefix = bestMatch.pathPrefix!.startsWith('/')
      ? bestMatch.pathPrefix!
      : `/${bestMatch.pathPrefix!}`
    const remainingPath = path.substring(normalizedPrefix.length) || '/'

    // Prefer proxyTargetUrl (internal cluster URL); fall back to
    // baseUrl for projects that haven't been migrated yet.
    const rawTarget = bestMatch.proxyTargetUrl?.trim() || bestMatch.baseUrl

    // Substitute ${env.<key>} against the project's Environment tab
    // values. Same rationale as /api/registers/resolve — keep the
    // template-as-config separation between code and per-env values.
    const { loadProjectEnvs, interpolateEnv } = await import('@/lib/env-resolver')
    const envs = await loadProjectEnvs(bestMatch.id)
    const target = interpolateEnv(rawTarget, envs)
    const apiKey = interpolateEnv(bestMatch.apiKey ?? '', envs) || bestMatch.apiKey

    return NextResponse.json({
      found: true,
      path,
      project: { ...bestMatch, apiKey },
      routing: {
        matchedPrefix: normalizedPrefix,
        remainingPath,
        targetUrl: `${target}${remainingPath}`,
      },
    })
  } catch (error: any) {
    console.error('Error resolving project by path:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
