import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Fully public paths — anyone on the internet may hit these.
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/settings/oidc',
  '/api/health',
  // Broker fetches runtime config from here. The route itself
  // performs its own X-Internal-Token check.
  '/api/internal/config',
  // Gateway proxy — external clients hit this to reach broker.
  // Downstream auth (API key / OAuth) is enforced at broker level.
  '/api/v1',
  // Broker validates client API keys here; the route validates the
  // posted key rather than the caller.
  '/api/api-keys/validate',
  // Broker auto-creates MessageFormats on unknown flowName.
  '/api/message/formats',
]

// Broker-to-Web internal routes. Before this change these were in
// PUBLIC_PATHS — which meant /api/flows and /api/registers leaked
// full configs to anonymous callers, and /api/audit etc. accepted
// anonymous POSTs. Now they accept either:
//
//   • X-Internal-Token matching env INTERNAL_API_TOKEN (broker path)
//   • Authorization: Bearer <jwt> from the admin UI (user path)
//
// If INTERNAL_API_TOKEN is unset (not rolled out yet) we fall back to
// the old "open" behaviour so the enforcement switches on only once
// the secret is wired into both pods. This makes the rollout safe to
// ship in two stages: code first, secret second.
const BROKER_INTERNAL_PATHS = [
  '/api/registers',
  '/api/flows',
  '/api/audit',
  '/api/events',
  '/api/logs',
  '/api/worker-jobs',
  // Broker's Level 2 passthrough hits this to resolve project by
  // pathPrefix. Without it, Level 2 falls through to Level 3 / 404.
  '/api/projects/resolve-by-path',
]

function pathMatches(pathname: string, path: string) {
  return pathname.startsWith('/orch' + path) || pathname.startsWith(path)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Fully public.
  if (PUBLIC_PATHS.some((p) => pathMatches(pathname, p))) {
    return NextResponse.next()
  }

  // Broker-internal. Accept X-Internal-Token OR user JWT.
  if (BROKER_INTERNAL_PATHS.some((p) => pathMatches(pathname, p))) {
    const expected = process.env.INTERNAL_API_TOKEN
    // Secret not configured yet — keep legacy open behaviour so the
    // first deploy of this code doesn't break the broker.
    if (!expected) return NextResponse.next()

    const internalTok = request.headers.get('x-internal-token')
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const cookie = request.cookies.get('auth-token')?.value

    if (internalTok === expected) return NextResponse.next()
    if (bearer || cookie) return NextResponse.next()

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Everything else — existing behaviour: user JWT required for /api/*,
  // page routes fall through to the client-side AuthGuard.
  const token =
    request.cookies.get('auth-token')?.value ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (pathname.startsWith('/orch/api/') || pathname.startsWith('/api/')) {
    if (process.env.NODE_ENV === 'development') return NextResponse.next()
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
