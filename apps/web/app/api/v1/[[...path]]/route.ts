import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Simple in-memory rate limiter
const rateLimitCounters = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(apiId: string, limitPerMin: number): boolean {
  const now = Date.now()
  const entry = rateLimitCounters.get(apiId)

  if (!entry || now >= entry.resetAt) {
    rateLimitCounters.set(apiId, { count: 1, resetAt: now + 60000 })
    return true // allowed
  }

  if (entry.count >= limitPerMin) {
    return false // rate limited
  }

  entry.count++
  return true // allowed
}

// Cache for API registrations
const apiCache = new Map<string, any>()
const CACHE_TTL = 60000

// Negative cache for paths that don't match any API (shorter TTL)
const negativeCache = new Map<string, number>()
const NEGATIVE_CACHE_TTL = 15000

/**
 * Match a URL path against a pattern that supports:
 * - Exact match: /users === /users
 * - Path params: /users/:id matches /users/123
 * - Wildcards: /api/* matches /api/anything/here
 */
function pathMatches(pattern: string, path: string): boolean {
  // Exact match
  if (pattern === path) return true

  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  for (let i = 0; i < patternParts.length; i++) {
    const seg = patternParts[i]

    // Wildcard matches all remaining segments
    if (seg === '*') return true

    // If path has fewer segments than pattern, no match
    if (i >= pathParts.length) return false

    // :param matches any single segment
    if (seg.startsWith(':')) continue

    // Literal segment must match exactly
    if (seg !== pathParts[i]) return false
  }

  // Both must be fully consumed (unless wildcard already returned)
  return patternParts.length === pathParts.length
}

async function findApiRegistration(
  method: string,
  path: string,
  bodyText?: string,
) {
  const cacheKey = `${method}:${path}`

  // Check negative cache first (path known to have no match)
  const negativeCachedAt = negativeCache.get(cacheKey)
  if (negativeCachedAt && Date.now() - negativeCachedAt < NEGATIVE_CACHE_TTL) {
    console.log(`[Orch Broker] Negative cache hit for ${method} ${path}`)
    return null
  }

  // Single-match cache hit. Multi-match scenarios (>1 candidate per
  // method+endpoint) are body-dependent so we never cache them — the
  // cache entry below is only written when there's exactly one
  // candidate.
  const cached = apiCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  console.log(`[Orch Broker] Looking for API: ${method} ${path}`)

  // Find matching API registration - query all active APIs and filter in memory
  const apis = await prisma.apiRegistration.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      flow: true,
    },
  })

  console.log(`[Orch Broker] Found ${apis.length} active APIs`)

  // All candidates that share method + endpoint pattern.
  const candidates = apis.filter(a => {
    if (a.method !== method) return false
    const endpointPath = a.endpoint.split('?')[0]
    return pathMatches(endpointPath, path)
  })

  if (candidates.length === 0) {
    console.log(`[Orch Broker] No API found for ${method} ${path}`)
    negativeCache.set(cacheKey, Date.now())
    return null
  }

  if (candidates.length === 1) {
    console.log(`[Orch Broker] Matched API: ${candidates[0].name}`)
    apiCache.set(cacheKey, { data: candidates[0], timestamp: Date.now() })
    return candidates[0]
  }

  // Multiple ApiRegistrations on the same URL — pick the one whose
  // active MessageFormat discriminator matches the request body
  // (e.g. $.flowName = "saveScreen01Action"). Sequential resolve so
  // the first hit wins; latency cost is bounded by candidates.length
  // and only paid when admins genuinely register N APIs on one URL.
  console.log(`[Orch Broker] Multi-match (${candidates.length}) for ${method} ${path} — disambiguating by MessageFormat`)
  for (const candidate of candidates) {
    // strict=true: only accept a format whose discriminator actually
    // claims this body. Lone-format / isDefault fallbacks would make
    // every candidate look like a winner and break disambiguation.
    const fmt = await resolveMessageFormat(candidate.id, bodyText ?? '', path, undefined, true)
    if (fmt) {
      console.log(`[Orch Broker] Multi-match resolved: ${candidate.name} (format ${(fmt as any).code ?? (fmt as any).name})`)
      // Body-dependent — skip cache, every request resolves fresh.
      return candidate
    }
  }

  // No format claimed the request — fall back to the first candidate
  // so the request still gets a response. The audit IIFE will skip
  // (no format) but broker passthrough still proxies.
  console.warn(`[Orch Broker] Multi-match: no format hit, falling back to ${candidates[0].name}`)
  return candidates[0]
}

// JSONPath-like extractor (supports $.a.b, $.a[0].b)
function extractJsonPath(obj: any, path: string): any {
  if (!path) return undefined
  const clean = path.replace(/^\$\.?/, '')
  if (!clean) return obj
  const parts = clean.split('.')
  let v: any = obj
  for (const p of parts) {
    if (v == null) return undefined
    const m = p.match(/^(\w+)\[(\d+)\]$/)
    if (m) v = v[m[1]]?.[parseInt(m[2])]
    else v = v[p]
  }
  return v
}

// Resolve MessageFormat by matching discriminator against request body
/**
 * Find which MessageFormat applies to this request.
 *
 * Resolution ladder (stops at first hit):
 *   1. Body discriminator (existing behaviour — flowName-style)
 *   2. Legacy header X-Request-Path discriminator
 *   3. ScreenButton detection rule on each format's buttons (Referer
 *      regex, header value, body-path match, query string match)
 *   4. If the API has a single format → use it
 *   5. The format flagged isDefault=true on this API (catch-all)
 *
 * Includes library refs (FieldMapping, AuditConfig) and buttons so
 * the caller can resolve effective fields without a second query.
 */
async function resolveMessageFormat(
  apiId: string,
  bodyText: string,
  requestPath: string,
  request?: NextRequest,
  /**
   * When true, skip the lone-format / isDefault fallbacks at the
   * bottom of the resolution ladder. Used by multi-API disambiguation
   * where "this API's only format" must NOT be taken as a match if
   * its discriminator doesn't actually claim the request — otherwise
   * every candidate appears to match and the first one always wins.
   */
  strict = false,
): Promise<any | null> {
  try {
    const formats = await prisma.messageFormat.findMany({
      where: { apiRegistrationId: apiId, status: 'ACTIVE' },
      include: {
        fieldMapping: true,
        auditConfig: true,
        buttons: { include: { screen: true } },
        // spec — datasets touched by this format. Carried into
        // audit_logs so /audit can filter "show me everything that
        // touched dataset X".
        dataCatalogs: { select: { id: true, name: true, category: true } },
      },
    })
    let body: any = {}
    try { body = bodyText ? JSON.parse(bodyText) : {} } catch {}

    // Pull a value from body (BODY) or header (HEADER) using the
    // same JSON-path-ish syntax as the discriminator. Returns
    // undefined when the path can't be resolved. Walks through
    // JSON-encoded strings transparently — microflow-style payloads
    // wrap the real fields in `request: "{ ... }"` strings, so a
    // path like $.object.input_X.request.action needs to JSON.parse
    // the request value before going deeper.
    const lookup = (source: string, field: string): unknown => {
      if (!field) return undefined
      if (source === 'HEADER') {
        return request?.headers.get(field) ?? undefined
      }
      const clean = field.replace(/^\$\.?/, '')
      if (!clean) return body
      const parts = clean.split('.')
      let v: any = body
      for (const p of parts) {
        if (v == null) return undefined
        // Encountering a JSON-encoded string mid-walk: parse and
        // continue. Only attempt when the string actually starts
        // like JSON to avoid eating up freeform values.
        if (typeof v === 'string') {
          const trimmed = v.trim()
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              const parsed = JSON.parse(trimmed)
              if (parsed && typeof parsed === 'object') v = parsed
              else return undefined
            } catch {
              return undefined
            }
          } else {
            return undefined
          }
        }
        const m = p.match(/^(\w+)\[(\d+)\]$/)
        if (m) v = v[m[1]]?.[parseInt(m[2])]
        else v = v[p]
      }
      return v
    }

    // Every entry in matchRules must hold for the format to claim
    // the request. Empty / null array = no extra constraints.
    const matchRulesPass = (f: any): boolean => {
      const rules = Array.isArray(f.matchRules) ? f.matchRules : null
      if (!rules || rules.length === 0) return true
      return rules.every((r: any) => {
        const src = r?.source ?? f.discriminatorSource ?? 'BODY'
        const v = lookup(String(src).toUpperCase(), String(r?.field ?? ''))
        return v === r?.value
      })
    }

    // 1+2: existing discriminator logic — extended to require every
    // matchRule to also hold (AND).
    for (const f of formats) {
      if (f.discriminatorSource === 'BODY' && f.discriminatorField && f.discriminatorValue) {
        const v = lookup('BODY', f.discriminatorField)
        if (v === f.discriminatorValue && matchRulesPass(f)) return f
      } else if (f.discriminatorSource === 'HEADER' && f.discriminatorField === 'X-Request-Path') {
        // Suffix-match the request path against the discriminator value,
        // tolerant of a leading module/base segment (e.g. "/my-api",
        // "/app-b") on either side. Strips the first path segment
        // generically — no per-project prefix hardcoded.
        if (requestPath.endsWith(f.discriminatorValue?.replace(/^\/[^/]+/, '') || '') && matchRulesPass(f)) return f
      } else if (f.discriminatorSource === 'NONE' && Array.isArray((f as any).matchRules) && (f as any).matchRules.length > 0) {
        // NONE source is fine when matchRules carry the entire
        // matching contract on their own.
        if (matchRulesPass(f)) return f
      }
    }

    // 3: ScreenButton detection rules. Only run when we have access to
    // the live NextRequest (older callers don't pass it).
    if (request) {
      const { matchScreenButton } = await import('@/lib/format-resolver')
      for (const f of formats) {
        const matched = matchScreenButton(request, body, f.buttons as any)
        if (matched) {
          ;(f as any).matchedButton = matched
          return f
        }
      }
    }

    // 4 + 5 are catch-all fallbacks: if no discriminator claimed the
    // request, accept the lone format on this API or the format
    // flagged isDefault. Multi-API disambiguation skips these because
    // "any format wins" makes every candidate look like a match and
    // the first registered API always swallows the request.
    if (!strict) {
      // 4: lone format
      if (formats.length === 1) return formats[0]
      // 5: explicit per-API default
      const def = formats.find((f) => (f as any).isDefault)
      if (def) return def
    }

    return null
  } catch (e) {
    console.error('[Gateway] Format resolve error:', e)
    return null
  }
}

// Hop-by-hop headers (RFC 7230 §6.1) + Next.js/proxy-specific ones
// that the downstream broker must not see verbatim. Everything else
// is forwarded transparently so example-style bypass-proxy endpoints
// see the same headers + query string + body as if nginx ingress
// were in front of them.
const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Content-Length will be recomputed by the fetch client when body is
  // re-emitted; forwarding the client's value can cause mismatches.
  'content-length',
])

async function forwardToBroker(
  api: any | null,
  request: NextRequest,
  path: string,
  method: string,
  preRead?: { bodyText: string; bodyBytes: ArrayBuffer | null; isBinaryBody: boolean },
) {
  const { getBrokerUrl } = await import('@/lib/system-config')
  const brokerUrl = await getBrokerUrl()
  const requestId = crypto.randomUUID()

  // Preserve the original query string so the backend (and broker
  // Level 2/3 passthrough) sees ?foo=bar untouched. Previously this
  // was dropped — anything that relied on query params broke.
  const incomingUrl = new URL(request.url)
  const qs = incomingUrl.search // includes leading "?" or empty
  const targetUrl = `${brokerUrl}/api/v1${path}${qs}`

  console.log(`[Orch Broker] Forwarding ${method} ${path}${qs} to broker: ${targetUrl} (registered=${!!api})`)

  const headers = new Headers()

  // Forward ALL client headers except hop-by-hop, nginx-ingress style.
  // Replaces the old whitelist of 7 headers which silently dropped
  // cookies, custom tenant headers, x-correlation-id, etc.
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  // Broker-internal tracing
  headers.set('X-Request-Id', requestId)

  // X-API-Id / X-Flow-Id only set when the API is registered.
  // When `api` is null we're in passthrough mode — broker resolves
  // via Level 2 (project.pathPrefix) or Level 3 (defaultBackendUrl).
  if (api) {
    headers.set('X-API-Id', api.id)
    if (api.flowId) headers.set('X-Flow-Id', api.flowId)
  }

  // Body forwarding strategy depends on Content-Type:
  //   - application/json (and friends): read as text, can be parsed
  //     for resolver / audit extraction.
  //   - multipart/form-data (file upload), application/octet-stream
  //     (raw binary), and any "binary-ish" content type: forward the
  //     raw byte buffer untouched. Calling request.text() on binary
  //     content corrupts it (utf-8 decoding loses bytes >= 0x80), so
  //     we read the ArrayBuffer instead and skip JSON-parsing for
  //     audit purposes — uploads still get an audit row, just without
  //     refId / refNo / transactionKey extraction.
  // Body must be supplied via preRead (handleRequest reads the
  // stream once and forwards the buffered version here, because the
  // upstream resolver may have already inspected it for multi-API
  // disambiguation). Re-reading request.body would error.
  const isBinaryBody = preRead?.isBinaryBody ?? false
  const bodyText = preRead?.bodyText ?? ''
  let body: BodyInit | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (isBinaryBody) {
      body = preRead?.bodyBytes ?? undefined
    } else {
      body = bodyText
    }
  }

  const startMs = Date.now()
  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: body || undefined,
      // @ts-expect-error — Node fetch needs duplex: 'half' to send
      // a streaming/binary body. Required for ArrayBuffer payloads.
      duplex: isBinaryBody ? 'half' : undefined,
    })

    // Decide whether to buffer the response body or stream it through.
    //
    // We only need the body downstream for two things:
    //   1. The audit IIFE (only fires when `api` is set — registered).
    //   2. evaluateEventLogPatterns capture='FULL_BODY' (response side).
    //
    // For unregistered + read-only traffic (GET/HEAD passthrough — the
    // common case for large static assets like the 16.8MB ej2.min.js)
    // neither needs the body, so buffering it just stalls TTFB and
    // wastes memory. Stream directly to the client instead. Audit /
    // event-log paths still buffer because they need the body.
    const canStream = !api && (method === 'GET' || method === 'HEAD')
    const responseBody = canStream ? '' : await response.text()
    const durationMs = Date.now() - startMs

    console.log(`[Orch Broker] Broker response: ${response.status}${canStream ? ' (streamed)' : ''}`)

    // Fire-and-forget event-log pattern evaluation. Independent of
    // the audit pipeline below — this captures observability
    // signals for traffic that may or may not have an
    // ApiRegistration / MessageFormat. Uses the same lookup helper
    // as the resolver so body / header rules can hit deeper paths.
    ;(async () => {
      try {
        await evaluateEventLogPatterns({
          method,
          path,
          bodyText,
          requestId,
          status: response.status,
          duration: durationMs,
          projectId: (api as any)?.projectId ?? null,
          request,
          // Pass the full response body. evaluateEventLogPatterns
          // only persists it when the matched pattern has
          // capture='FULL_BODY', so SUMMARY/NONE rules don't bloat
          // event_logs.
          responseBody,
        })
      } catch (e) {
        console.error('[EventLog] pattern evaluation failed:', e)
      }
    })()

    // ── Audit persistence (gateway, fire-and-forget) ─────────────────
    // the module `/my-api/microflow/service` is Level-1 PROXY (no flow, no
    // broker audit node) — the gateway is the only place that sees this
    // traffic WITH MessageFormat context, so audit MUST happen here.
    //   - `changes.fieldChanges` = {field:{old,new}} the /audit modal
    //     renders. Proxy = no prior state, so old=null; new = the saved
    //     CLOB request fields ($.object.*.request).
    //   - de-dups the the client frontend's repeated microflow POSTs per save.
    ;(async () => {
      if (!api) return
      // §3 double-write guard: when the request ran a flow whose audit node
      // already wrote the audit, the broker signals it via the X-Orch-Audit
      // response header. Skip the gateway fallback writer so we don't get
      // two audit rows. Proxy paths (no node) never set this header, so the
      // gateway remains the sole writer there.
      if (response.headers.get('x-orch-audit') === 'node') {
        console.log('[Gateway] Audit already written by broker node — skipping gateway fallback')
        return
      }
      try {
        // strict=true: only audit when the request's discriminator (flowName)
        // ACTUALLY matches a configured MessageFormat. Without this, a read/
        // load call (loadSample…, getSample… — which have no format) falls through to
        // the lone-format / isDefault fallback and gets audited as a phantom
        // CREATE with empty data. Audit must reflect real write actions only.
        const format = await resolveMessageFormat(api.id, bodyText, path, request, true)
        if (!format) {
          console.log(`[Gateway] No matching MessageFormat for ${method} ${path} — skipping audit (read/unmatched request)`)
          return
        }
        const { resolveFormat, jsonPathGet, jsonPathGetSmart, extractUsername, extractTransactionKey, applyMask } =
          await import('@/lib/format-resolver')
        const resolved = resolveFormat(format as any)
        if (!resolved.auditEnabled) {
          console.log(`[Gateway] AuditConfig disabled for ${format.code} — skipping audit`)
          return
        }
        const writeActionTypes = new Set(['SIGNOFF', 'SUBMIT', 'APPROVE', 'REJECT', 'CREATE', 'UPDATE', 'DELETE', 'CLONE'])
        if (!format.actionType || !writeActionTypes.has(format.actionType as string)) {
          console.log(`[Gateway] MessageFormat ${format.code} is ${format.actionType} — event log only, no audit`)
          return
        }

        const clientIp = request.headers.get('x-real-ip')
          || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || null
        let bodyJson: unknown = null
        try { bodyJson = bodyText ? JSON.parse(bodyText) : null } catch { /* keep null */ }

        // Username from the resolved source (BODY_PATH / JWT / header) with
        // X-User-Id fallback. Returns the username string (e.g. an email).
        const username = extractUsername(request, bodyJson, resolved)
        const refId   = resolved.refIdPath   ? String(jsonPathGet(bodyJson, resolved.refIdPath)   ?? '') : ''
        const refNo   = resolved.refNoPath   ? String(jsonPathGet(bodyJson, resolved.refNoPath)   ?? '') : ''
        const refName = resolved.refNamePath ? String(jsonPathGet(bodyJson, resolved.refNamePath) ?? '') : ''
        const transactionKey = extractTransactionKey(bodyJson, resolved)

        // spec — mask BEFORE persisting + building the diff.
        const maskList = Array.isArray(resolved.maskPaths) ? resolved.maskPaths as string[] : null
        const safeBody = maskList?.length ? applyMask(bodyJson, maskList) : bodyJson

        // Build {field:{old,new}} for the Changes tab. Prefer the saved
        // CLOB request payload so admins see real fields, not the envelope.
        // CLOB diff source: prefer the library's configured clobPath
        // (FieldMapping.clobPath); for MICROFLOW formats fall back to the
        // standard envelope path; otherwise use the whole body. Generic —
        // no per-project (per-project) path hardcoded.
        // Detect a microflow envelope by SHAPE too: the matched format may be an
        // auto-created / default one that isn't tagged MICROFLOW nor linked to a
        // clobPath, yet the body still wraps the real fields in object.*.request.
        // Without this, the diff captures the whole envelope as one "object" blob.
        const sb = (safeBody && typeof safeBody === 'object') ? safeBody as Record<string, unknown> : null
        const looksMicroflow = !!(sb && sb.object && (sb.flowName !== undefined || sb.appName !== undefined))
        const clobPath = resolved.clobPath
          || ((format.formatType === 'MICROFLOW' || looksMicroflow) ? '$.object.*.request' : null)
        let reqPayload: unknown = clobPath ? jsonPathGetSmart(safeBody, clobPath) : null
        // The CLOB `request` is usually a stringified JSON OBJECT. jsonPathGetSmart
        // only auto-parses a final string that decodes to a PRIMITIVE, so an
        // object-string comes back as a raw string here — parse it so the diff
        // shows real business fields (ORDER_YEAR, REGION, …) instead of one
        // opaque "object" blob. On parse failure we leave it (whole-body fallback).
        if (typeof reqPayload === 'string') {
          try { reqPayload = JSON.parse(reqPayload) } catch { /* not JSON → fall back to whole body */ }
        }
        const diffSrc = (reqPayload && typeof reqPayload === 'object' && !Array.isArray(reqPayload))
          ? reqPayload as Record<string, unknown>
          : (safeBody && typeof safeBody === 'object' ? safeBody as Record<string, unknown> : {})
        const fieldChanges: Record<string, { old: null; new: unknown }> = {}
        for (const [k, v] of Object.entries(diffSrc)) fieldChanges[k] = { old: null, new: v }

        const datasets = (resolved.dataCatalogs ?? []).map(c => ({ id: c.id, name: c.name, category: c.category }))

        // Resolve username → users FK by id / username / email so the
        // audit attributes the REAL acting user (not the system fallback).
        let resolvedUserId = ''
        if (username) {
          const u = await prisma.user.findFirst({
            where: { OR: [{ id: username }, { username }, { email: username }] }, select: { id: true },
          })
          if (u) resolvedUserId = u.id
        }
        if (!resolvedUserId) {
          const fb = await prisma.user.findFirst({ where: { OR: [{ username: 'system' }, { username: 'admin' }] }, select: { id: true } })
          resolvedUserId = fb?.id || (await prisma.user.findFirst({ select: { id: true } }))?.id || ''
        }
        if (!resolvedUserId) return

        const actionEnum = ({
          'CREATE': 'CREATE', 'UPDATE': 'UPDATE', 'DELETE': 'DELETE', 'APPROVE': 'APPROVE', 'REJECT': 'REJECT',
          'SIGNOFF': 'UPDATE', 'SUBMIT': 'UPDATE', 'CLONE': 'CREATE',
        } as Record<string, string>)[format.actionType as string] || 'API_CALL'
        // entityType = the configured business entity type (refType). When a
        // library doesn't set one, fall back to the API name — a REAL
        // identifier — never a synthesized magic value (no synthesized constants).
        const entityType = resolved.refType || api.name || 'unknown'
        const entityId = refId || format.code || api.name

        // De-dup: the the client frontend fires several identical microflow
        // POSTs per save. Skip if an identical (txnKey+action+entity) row
        // was written in the last 10s. Best-effort (rapid concurrent POSTs
        // may slip; /audit "Group by Transaction" also collapses by txnKey).
        if (transactionKey) {
          const dup = await prisma.auditLog.findFirst({
            where: {
              action: actionEnum as any, entityType, entityId,
              timestamp: { gte: new Date(Date.now() - 10_000) },
              changes: { path: ['transactionKey'], equals: transactionKey },
            },
            select: { id: true },
          })
          if (dup) { console.log(`[Gateway] Skip duplicate audit (txn ${transactionKey})`); return }
        }

        const matchedButton = (format as any).matchedButton as
          | { id: string; buttonLabel: string; tabName?: string | null; screen?: { code: string; name: string } | null }
          | undefined

        await prisma.auditLog.create({
          data: {
            action: actionEnum as any,
            entityType,
            entityId,
            userId: resolvedUserId,
            userIp: clientIp || undefined,
            newValues: safeBody || undefined,
            changes: {
              formatCode: format.code,
              formatName: format.name,
              actionType: format.actionType,
              actionLabel: format.actionLabel,
              system: format.system,
              screenCode: matchedButton?.screen?.code ?? format.screenCode,
              screenName: matchedButton?.screen?.name ?? format.screenName,
              tabName:    matchedButton?.tabName ?? format.tabName,
              buttonLabel: matchedButton?.buttonLabel,
              buttonId:    matchedButton?.id,
              refType:    resolved.refType,
              refId:      refId  || undefined,
              refNo:      refNo  || undefined,
              refName:    refName|| undefined,
              transactionKey: transactionKey || undefined,
              dataCatalogs: datasets.length ? datasets : undefined,
              path,
              method,
              statusCode: response.status,
              durationMs,
              requestId,
              // ★ the field-by-field diff the /audit modal renders
              fieldChanges,
            } as any,
            description: `${format.actionType} · ${matchedButton?.screen?.name ?? format.screenName ?? format.screenCode ?? ''} · ${matchedButton?.buttonLabel ?? format.actionLabel ?? format.name}`,
            timestamp: new Date(),
          },
        })
      } catch (e) {
        console.error('[Gateway] Audit persist failed:', e)
      }
    })()

    const responseHeaders = new Headers()
    responseHeaders.set('X-Request-Id', requestId)

    const brokerContentType = response.headers.get('content-type')
    if (brokerContentType) {
      responseHeaders.set('Content-Type', brokerContentType)
    }

    // Forward broker response headers that clients need to see
    const responseHeadersToForward = [
      'x-idempotent-replay',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after',
    ]
    for (const h of responseHeadersToForward) {
      const v = response.headers.get(h)
      if (v) responseHeaders.set(h, v)
    }
    
    return new NextResponse(canStream ? response.body : responseBody, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('[Orch Broker] Error forwarding to broker:', error)
    return NextResponse.json(
      { error: 'Failed to forward request to broker', requestId },
      { status: 502 }
    )
  }
}

// Next.js 15+ params is a Promise
async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path: pathSegments } = await params
  const path = pathSegments ? `/${pathSegments.join('/')}` : '/'
  const method = request.method

  console.log(`[Orch Broker] ${method} /api/v1${path}`)

  // Read body up front. We need it for two reasons:
  //   1. Multi-API match: when several ApiRegistrations share an
  //      endpoint, we resolve the request body's discriminator
  //      (e.g. $.flowName) against each candidate's MessageFormat
  //      to pick the right one.
  //   2. Forwarding: forwardToBroker re-emits the body to the broker
  //      and the audit IIFE re-parses it for refId/transactionKey.
  // The request body stream can only be consumed once, so we read it
  // here and pass the buffered version downstream.
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  const isBinaryBody =
    contentType.startsWith('multipart/') ||
    contentType.startsWith('application/octet-stream') ||
    contentType.startsWith('application/pdf') ||
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/')
  let bodyText = ''
  let bodyBytes: ArrayBuffer | null = null
  if (method !== 'GET' && method !== 'HEAD') {
    if (isBinaryBody) {
      bodyBytes = await request.arrayBuffer()
    } else {
      bodyText = await request.text()
    }
  }
  const preReadBody: PreReadBody = { bodyText, bodyBytes, isBinaryBody }

  // Match against endpoint stored in DB (without /api/v1 prefix). For
  // shared-endpoint setups (multiple APIs registered on the same URL,
  // each with its own MessageFormat discriminator), bodyText is what
  // disambiguates them.
  const api = await findApiRegistration(method, path, bodyText)

  // No registration → PASSTHROUGH to broker (nginx-ingress style).
  // Broker's Level 2 (project.pathPrefix) and Level 3 (orch.defaultBackendUrl)
  // decide what to do. If neither matches, broker returns 404 itself.
  // Previously this path short-circuited with 404 here, which meant Level
  // 2/3 logic never executed — that's the bug users asked us to fix.
  if (!api) {
    console.log(`[Orch Broker] No registration — passthrough to broker (Level 2/3)`)
    return forwardToBroker(null, request, path, method, preReadBody)
  }

  // For SHARED_ENDPOINT, the effective flow comes from the matched
  // MessageFormat (resolved by broker per request body). API-level
  // flowId is just a fallback. So only block when DEDICATED with no
  // flow at all — SHARED_ENDPOINT can legitimately leave it null.
  if (!api.flowId && (api as any).routeType !== 'SHARED_ENDPOINT') {
    return NextResponse.json({ error: 'No flow configured for this API' }, { status: 500 })
  }

  // Rate limit check
  if (api.rateLimitPerMin && !checkRateLimit(api.id, api.rateLimitPerMin)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: 60 },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  return forwardToBroker(api, request, path, method, preReadBody)
}

type PreReadBody = {
  bodyText: string
  bodyBytes: ArrayBuffer | null
  isBinaryBody: boolean
}

// ==================== EVENT LOG PATTERNS (gateway hook) ====================
//
// Loaded once per process and refreshed lazily — the patterns are
// admin-managed config, not request-frequency, so a TTL-based cache
// keeps overhead negligible without forcing pod restarts on every
// edit.

type Pattern = {
  id: string
  projectId: string | null
  name: string
  pathPattern: string
  methodMatch: string
  bodyMatch: any
  capture: 'SUMMARY' | 'FULL_BODY' | 'NONE'
  level: string
  enabled: boolean
}

let patternCache: { rows: Pattern[]; loadedAt: number } | null = null
const PATTERN_CACHE_TTL = 30_000

async function loadPatterns(): Promise<Pattern[]> {
  if (patternCache && Date.now() - patternCache.loadedAt < PATTERN_CACHE_TTL) {
    return patternCache.rows
  }
  const rows = await prisma.eventLogPattern.findMany({
    where: { enabled: true },
    select: {
      id: true,
      projectId: true,
      name: true,
      pathPattern: true,
      methodMatch: true,
      bodyMatch: true,
      capture: true,
      level: true,
      enabled: true,
    },
  })
  patternCache = { rows: rows as Pattern[], loadedAt: Date.now() }
  return rows as Pattern[]
}

// Walk the same path syntax as resolveMessageFormat — JSONPath-ish,
// auto-parses JSON-encoded strings mid-walk.
function lookupBody(body: any, field: string): unknown {
  if (!field) return undefined
  const clean = field.replace(/^\$\.?/, '')
  if (!clean) return body
  const parts = clean.split('.')
  let v: any = body
  for (const p of parts) {
    if (v == null) return undefined
    if (typeof v === 'string') {
      const t = v.trim()
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          const parsed = JSON.parse(t)
          if (parsed && typeof parsed === 'object') v = parsed
          else return undefined
        } catch {
          return undefined
        }
      } else {
        return undefined
      }
    }
    const m = p.match(/^(\w+)\[(\d+)\]$/)
    if (m) v = v[m[1]]?.[parseInt(m[2])]
    else v = v[p]
  }
  return v
}

async function evaluateEventLogPatterns(args: {
  method: string
  path: string
  bodyText: string
  requestId: string
  status: number
  duration: number
  projectId: string | null
  request: NextRequest
  responseBody?: string
}) {
  const { method, path, bodyText, requestId, status, duration, projectId, request, responseBody } = args
  const patterns = await loadPatterns()
  if (patterns.length === 0) return

  let parsed: any = null
  try { parsed = bodyText ? JSON.parse(bodyText) : null } catch { /* ignore */ }

  for (const p of patterns) {
    // Project-scope filter: a pattern matches when its projectId is
    // null (global) or equals the request's resolved project.
    if (p.projectId && p.projectId !== projectId) continue
    if (p.methodMatch !== 'ANY' && p.methodMatch !== method) continue
    if (!pathMatches(p.pathPattern, path)) continue

    // Body / header AND-rules — same shape as MessageFormat.matchRules.
    const rules = Array.isArray(p.bodyMatch) ? p.bodyMatch : null
    if (rules && rules.length > 0) {
      const allHold = rules.every((r: any) => {
        const src = String(r?.source ?? 'BODY').toUpperCase()
        if (src === 'HEADER') {
          return request.headers.get(String(r?.field ?? '')) === r?.value
        }
        return lookupBody(parsed, String(r?.field ?? '')) === r?.value
      })
      if (!allHold) continue
    }

    if (p.capture === 'NONE') continue

    const data: any = {
      patternId: p.id,
      patternName: p.name,
      method,
      path,
      status,
      durationMs: duration,
    }
    if (p.capture === 'FULL_BODY') {
      data.requestBody = parsed ?? bodyText ?? null
      if (responseBody) {
        try { data.responseBody = JSON.parse(responseBody) } catch { data.responseBody = responseBody }
      }
    }

    // Write the matched pattern to event_logs. Proxy paths (e.g. the APP-A
    // microflow service) have NO eventLog flow node, so the gateway pattern
    // matcher is their only source of event_logs — symmetric with the audit
    // fallback (outside-a-node = gateway covers proxy; flows with an eventLog
    // node still log via the node → Kafka consumer → /api/events).
    try {
      await prisma.eventLog.create({
        data: {
          eventType: 'pattern_match',
          level: p.level,
          message: `${method} ${path} → ${status}`,
          data,
          requestId,
        },
      })
    } catch (e) {
      console.error('[EventLog] failed to write event_logs row:', e)
    }
  }
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
