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


// ---------- JWT verification (HS256, Web Crypto — runs on the edge) ----------
// The previous check only tested that *some* token was present, so any
// string ("Bearer x") passed and the API then treated the caller as an
// unauthenticated internal request with no tenant filter.
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : ''
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function jwtSecret(): string | null {
  const s = process.env.JWT_SECRET
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV === 'production') return null // fail closed
  return s || 'orch-dev-only-secret'
}

async function verifyJwt(token: string): Promise<boolean> {
  try {
    const secret = jwtSecret()
    if (!secret) return false
    const [h, p, sig] = token.split('.')
    if (!h || !p || !sig) return false
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))
    if (header.alg !== 'HS256') return false
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    )
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig) as BufferSource, new TextEncoder().encode(`${h}.${p}`))
    if (!ok) return false
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return false
    return true
  } catch {
    return false
  }
}

/** Same precedence the API routes use: Authorization header first, then the auth-token cookie. */
function requestToken(request: NextRequest): string | undefined {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || request.cookies.get('auth-token')?.value || undefined
}

function pathMatches(pathname: string, path: string) {
  return pathname.startsWith('/orch' + path) || pathname.startsWith(path)
}

export async function middleware(request: NextRequest) {
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
    if (internalTok === expected) return NextResponse.next()
    const tok = requestToken(request)
    if (tok && (await verifyJwt(tok))) return NextResponse.next()

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Everything else — existing behaviour: user JWT required for /api/*,
  // page routes fall through to the client-side AuthGuard.
  const token = requestToken(request)

  if (pathname.startsWith('/orch/api/') || pathname.startsWith('/api/')) {
    // Dev keeps the old "no token needed" shortcut, but a token that IS
    // sent must be genuine everywhere.
    if (!token && process.env.NODE_ENV === 'development') return NextResponse.next()
    if (!token || !(await verifyJwt(token))) {
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
