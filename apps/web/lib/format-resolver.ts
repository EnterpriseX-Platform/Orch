/**
 * format-resolver.ts — runtime helpers for the new MessageFormat
 * library + override architecture.
 *
 * Used by the Next.js gateway (`app/api/v1/[[...path]]/route.ts`) to:
 *
 *   1. Merge a MessageFormat with its FieldMapping / AuditConfig
 *      library refs ("override > library > null").
 *   2. Extract the username from configurable sources (JWT claim,
 *      request header, body JSONPath, session, fixed). Replaces the
 *      old hardcoded `headers.get('x-user-id')` path.
 *   3. Match an incoming request to a ScreenButton when the
 *      MessageFormat has multiple call-sites attached (e.g. SIGNOFF
 *      used on three different screens). Detection rules can use
 *      Referer regex, header value, body JSONPath match, or query
 *      parameter — whichever the frontend already exposes.
 *   4. Provide JSONPath extraction for `$.a.b[0].c` style paths
 *      shared by many configs (refIdPath, refNoPath, etc.).
 */

import type { NextRequest } from 'next/server'

// Minimal shape we need — kept loose to avoid importing Prisma types
// into route handlers (which would force Node runtime resolution).
type FieldMappingLib = {
  refType?: string | null
  refIdPath?: string | null
  refNoPath?: string | null
  refNamePath?: string | null
  pkXPath?: string | null
  usernameSource?: string | null
  usernameField?: string | null
  usernameStatic?: string | null
  // Transaction grouping (Sprint: audit-transaction-key)
  clobPath?: string | null
  transactionKeyFields?: unknown // Json — expected string[]
}

type AuditConfigLib = {
  enabled: boolean
  extractFields?: unknown
  auditFields?: unknown
}

export type MessageFormatWithLibs = {
  // Per-row override fields (any may be null → use library)
  refIdPath?: string | null
  refNoPath?: string | null
  refNamePath?: string | null
  pkXPath?: string | null
  refType?: string | null
  usernameSource?: string | null
  usernameField?: string | null
  usernameStatic?: string | null
  auditEnabled?: boolean | null

  // Library refs (may be missing if fieldMappingId/auditConfigId is null)
  fieldMapping?: FieldMappingLib | null
  auditConfig?: AuditConfigLib | null

  // Existing format fields used as fallbacks
  userIdPath?: string | null
  auditFields?: unknown

  // spec — JSONPath array of fields to redact before audit write.
  maskPaths?: unknown // Json — expected string[]

  // spec — Mapped DataCatalog ids carried into audit row.
  dataCatalogs?: { id: string; name: string; category: string }[]
}

export type ScreenButtonRow = {
  id: string
  tabName?: string | null
  buttonLabel: string
  actionType?: string | null
  detectionSource?: string | null   // 'REFERER' | 'HEADER' | 'BODY_PATH' | 'QUERY' | 'MANUAL' | null
  detectionField?: string | null
  detectionValue?: string | null
  screen?: { code: string; name: string; system?: string | null } | null
}

/**
 * Resolve a MessageFormat with its libraries: per-row override
 * wins, library is the fallback. Returns a flat object with the
 * effective values the gateway uses.
 */
export function resolveFormat(f: MessageFormatWithLibs) {
  const fm = f.fieldMapping
  const ac = f.auditConfig
  return {
    refType:        f.refType        ?? fm?.refType        ?? null,
    refIdPath:      f.refIdPath      ?? fm?.refIdPath      ?? null,
    refNoPath:      f.refNoPath      ?? fm?.refNoPath      ?? null,
    refNamePath:    f.refNamePath    ?? fm?.refNamePath    ?? null,
    pkXPath:        f.pkXPath        ?? fm?.pkXPath        ?? null,
    usernameSource: f.usernameSource ?? fm?.usernameSource ?? null,
    usernameField:  f.usernameField  ?? fm?.usernameField  ?? null,
    usernameStatic: f.usernameStatic ?? fm?.usernameStatic ?? null,

    // Transaction grouping (only library-level — formats don't override)
    clobPath:             fm?.clobPath ?? null,
    transactionKeyFields: fm?.transactionKeyFields ?? null,

    auditEnabled:   f.auditEnabled   ?? ac?.enabled        ?? false,
    auditFields:    (ac?.auditFields ?? f.auditFields)     ?? null,

    // Format-level only (no library override): masking + datasets.
    // Both come straight from MessageFormat — libraries don't carry
    // these because they describe per-format domain context.
    maskPaths:    f.maskPaths     ?? null,
    dataCatalogs: f.dataCatalogs  ?? [],
  }
}

/**
 * Replace values at given JSONPaths with "***" so audit_logs never
 * sees PII / passwords / financial data raw. Operates on a clone so
 * the original body keeps its real values for downstream proxying.
 *
 * Supports the same `$.a.b[0].c` and `$.object.*.password` syntax
 * jsonPathGet uses. A path that targets a non-existent field is a
 * silent no-op (no throw).
 */
export function applyMask(body: unknown, paths: string[] | null | undefined): unknown {
  if (!body || !paths?.length) return body
  // Cheap deep-clone via JSON.* — audit bodies are JSON anyway.
  let clone: unknown
  try { clone = JSON.parse(JSON.stringify(body)) } catch { return body }
  for (const path of paths) {
    if (!path) continue
    setMasked(clone, path)
  }
  return clone
}

function setMasked(obj: unknown, path: string): void {
  const clean = path.replace(/^\$\.?/, '')
  const parts = clean.split('.')
  setRecursive(obj, parts, 0)
}

function setRecursive(node: unknown, parts: string[], i: number): void {
  if (node == null || typeof node !== 'object' || i >= parts.length) return
  const seg = parts[i]
  const last = i === parts.length - 1
  if (seg === '*') {
    // Wildcard — fan out to every key at this level
    for (const k of Object.keys(node as Record<string, unknown>)) {
      const child = (node as Record<string, unknown>)[k]
      if (last) (node as Record<string, unknown>)[k] = '***'
      else setRecursive(child, parts, i + 1)
    }
    return
  }
  const m = seg.match(/^(\w+)\[(\d+)\]$/)
  if (m) {
    const arr = (node as Record<string, unknown>)[m[1]]
    if (Array.isArray(arr)) {
      const idx = parseInt(m[2], 10)
      if (last) arr[idx] = '***'
      else setRecursive(arr[idx], parts, i + 1)
    }
    return
  }
  if (last) {
    if (seg in (node as Record<string, unknown>)) {
      (node as Record<string, unknown>)[seg] = '***'
    }
    return
  }
  setRecursive((node as Record<string, unknown>)[seg], parts, i + 1)
}

/**
 * Look up a value through any single-level wildcard segment. JSONPath
 * 1.0 doesn't natively support `$.object.*.request`, so we expand `*`
 * by reading every key at that level and returning the first non-null
 * match. Avoids forcing admins to know the exact `input_<flowName>`
 * key when the body wraps the CLOB inside a per-flow object.
 */
function jsonPathGetWithWildcard(obj: unknown, path: string): unknown {
  if (!path.includes('*')) return jsonPathGet(obj, path)
  const clean = path.replace(/^\$\.?/, '')
  const segments = clean.split('.')
  let current: unknown[] = [obj]
  for (const seg of segments) {
    const next: unknown[] = []
    for (const cur of current) {
      if (cur == null) continue
      if (seg === '*') {
        if (typeof cur === 'object') next.push(...Object.values(cur as Record<string, unknown>))
      } else {
        const m = seg.match(/^(\w+)\[(\d+)\]$/)
        if (m) {
          const arr = (cur as Record<string, unknown>)[m[1]]
          if (Array.isArray(arr)) next.push(arr[parseInt(m[2], 10)])
        } else {
          next.push((cur as Record<string, unknown>)[seg])
        }
      }
    }
    current = next.filter(v => v !== undefined)
    if (!current.length) return undefined
  }
  return current[0]
}

/**
 * jsonPathGetSmart — like jsonPathGetWithWildcard, but also auto-parses
 * any intermediate node that's a JSON-encoded string before continuing
 * the traversal. Lets a single path like
 *   `$.object.*.request.user_name`
 * reach inside the microflow-envelope CLOB without the admin having to
 * configure a separate clobPath.
 */
export function jsonPathGetSmart(obj: unknown, path: string | null | undefined): unknown {
  if (!path || obj == null) return undefined
  const clean = path.replace(/^\$\.?/, '')
  if (!clean) return obj
  const segments = clean.split('.')
  let current: unknown[] = [obj]
  for (const seg of segments) {
    const next: unknown[] = []
    for (const raw of current) {
      // Auto-parse JSON-string nodes — common when admins point at a
      // CLOB column instead of pre-parsed JSON.
      let cur: unknown = raw
      if (typeof cur === 'string') {
        try { cur = JSON.parse(cur) } catch { /* not JSON, leave as-is */ }
      }
      if (cur == null) continue
      if (seg === '*') {
        if (typeof cur === 'object') next.push(...Object.values(cur as Record<string, unknown>))
        continue
      }
      const m = seg.match(/^(\w+)\[(\d+)\]$/)
      if (m) {
        const arr = (cur as Record<string, unknown>)[m[1]]
        if (Array.isArray(arr)) next.push(arr[parseInt(m[2], 10)])
      } else {
        next.push((cur as Record<string, unknown>)[seg])
      }
    }
    current = next.filter(v => v !== undefined)
    if (!current.length) return undefined
  }
  // Final node may itself be a JSON string we want as a primitive
  // (e.g. `user_name` inside a stringified CLOB).
  let last = current[0]
  if (typeof last === 'string') {
    try { const j = JSON.parse(last); if (typeof j === 'string') last = j } catch { /* keep string */ }
  }
  return last
}

/**
 * Extract a stable transaction key from the body. The library is told:
 *   - WHERE the stringified CLOB lives (`clobPath`, supports `*`)
 *   - WHICH fields inside the CLOB matter (`transactionKeyFields`)
 *
 * Returns `"FY|AGC"` style keys, or `null` if any required step fails.
 * Audit rows that share this key belong to the same business
 * transaction even when uniqueId differs per HTTP call.
 */
export function extractTransactionKey(
  body: unknown,
  resolved: ReturnType<typeof resolveFormat>,
): string | null {
  if (!resolved.clobPath) return null
  const fields = resolved.transactionKeyFields
  if (!Array.isArray(fields) || fields.length === 0) return null

  const raw = jsonPathGetWithWildcard(body, resolved.clobPath)
  if (raw == null) return null

  // The CLOB may already be parsed (object) or still stringified.
  let parsed: Record<string, unknown> | null = null
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return null }
  } else if (typeof raw === 'object') {
    parsed = raw as Record<string, unknown>
  }
  if (!parsed) return null

  const parts = (fields as string[]).map(f => {
    const v = parsed![f]
    return v == null ? '' : String(v)
  })
  if (parts.every(p => !p)) return null
  return parts.join('|')
}

/**
 * Extract a value from a JSON object using a `$.a.b[0].c` style path.
 * Returns undefined when any segment is missing rather than throwing,
 * since gateway code calls this on user-controlled bodies.
 */
export function jsonPathGet(obj: unknown, path: string | null | undefined): unknown {
  if (!path || obj == null) return undefined
  const clean = path.replace(/^\$\.?/, '')
  if (!clean) return obj
  const parts = clean.split('.')
  let v: unknown = obj
  for (const p of parts) {
    if (v == null) return undefined
    const m = p.match(/^(\w+)\[(\d+)\]$/)
    if (m) {
      const arr = (v as Record<string, unknown>)[m[1]]
      v = Array.isArray(arr) ? arr[parseInt(m[2], 10)] : undefined
    } else {
      v = (v as Record<string, unknown>)[p]
    }
  }
  return v
}

/**
 * Decode a JWT without verifying. Used for extracting claims when the
 * source is JWT_CLAIM. Verification is the auth layer's job, not ours
 * — we just want the username for audit logging.
 */
function decodeJwtPayload(authHeader: string | null): Record<string, unknown> | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf-8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Extract the username for audit using the resolved format's
 * usernameSource. Falls back to the legacy `X-User-Id` header so old
 * formats with no library + no override keep working.
 *
 * Returns null when nothing matches — caller decides how to react
 * (typically: drop to a system user fallback so audit_logs.user_id
 * remains a valid FK).
 */
export function extractUsername(
  request: NextRequest,
  body: unknown,
  resolved: ReturnType<typeof resolveFormat>,
): string | null {
  const src = resolved.usernameSource

  // STATIC always wins regardless of field
  if (src === 'STATIC' && resolved.usernameStatic) return resolved.usernameStatic

  if (src === 'BODY_PATH' && resolved.usernameField) {
    // Walk wildcards + auto-parse JSON-string CLOBs along the way so
    // `$.object.*.request.user_name` finds the username even when
    // `request` is still a stringified JSON blob (microflow-envelope
    // payload shape). Falls back to jsonPathGet for plain paths.
    const v = jsonPathGetSmart(body, resolved.usernameField)
    if (typeof v === 'string' && v.length > 0) return v
  }

  if (src === 'HEADER' && resolved.usernameField) {
    const v = request.headers.get(resolved.usernameField)
    if (v) return v
  }

  if (src === 'JWT_CLAIM' && resolved.usernameField) {
    const claims = decodeJwtPayload(request.headers.get('authorization'))
    const v = claims?.[resolved.usernameField]
    if (typeof v === 'string' && v.length > 0) return v
  }

  // SESSION not implemented yet — would need orch session lookup.

  // Legacy fallback: keep the X-User-Id header behaviour so old data
  // without any new config still produces a username.
  return request.headers.get('x-user-id')
}

/**
 * Find which ScreenButton fired this request, if any. Returns the
 * first ScreenButton whose detection rule matches; null when no
 * rule matches or the format has no buttons attached.
 *
 * The gateway can use this to record button-level provenance in the
 * audit log without the frontend having to send X-Source-* headers.
 */
export function matchScreenButton(
  request: NextRequest,
  body: unknown,
  buttons: ScreenButtonRow[] | undefined | null,
): ScreenButtonRow | null {
  if (!buttons?.length) return null

  for (const b of buttons) {
    if (!b.detectionSource || b.detectionSource === 'MANUAL') continue
    const expected = b.detectionValue
    if (!expected) continue

    let actual: string | null | undefined
    switch (b.detectionSource) {
      case 'REFERER':
        actual = request.headers.get('referer')
        break
      case 'HEADER':
        if (!b.detectionField) continue
        actual = request.headers.get(b.detectionField)
        break
      case 'BODY_PATH':
        if (!b.detectionField) continue
        actual = String(jsonPathGet(body, b.detectionField) ?? '')
        break
      case 'QUERY':
        if (!b.detectionField) continue
        actual = request.nextUrl.searchParams.get(b.detectionField)
        break
      default:
        continue
    }

    if (actual == null) continue

    // detectionValue is treated as a regex; if it's not a valid regex
    // we fall back to substring match.
    let matched = false
    try {
      matched = new RegExp(expected).test(actual)
    } catch {
      matched = actual.includes(expected)
    }
    if (matched) return b
  }

  return null
}
