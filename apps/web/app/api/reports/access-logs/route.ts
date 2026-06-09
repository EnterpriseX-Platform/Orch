import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/reports/access-logs
 *
 * Access logs (per-request gateway/broker traffic) are NOT stored in the DB —
 * the broker emits them as structured JSON lines to stdout under the
 * `access_log` tracing target. Promtail ships those lines to Loki. This route
 * queries Loki's HTTP API (LogQL) for the broker's access_log lines, parses the
 * embedded JSON, and returns a normalized list for the /orch/reports view.
 *
 * Why Loki and not the DB: access logs are high-volume ops data. Keeping them
 * out of Postgres avoids per-request DB writes (wait time) and unbounded table
 * growth — exactly the separation the event_logs (business events, /orch/logs)
 * vs access_logs (traffic, here) split is meant to enforce.
 */

// Default to the same-namespace service name so this works in every env
// (SIT orch-dev, UAT/PROD orch-prod) as long as Loki is deployed alongside
// orch. Override with LOKI_URL on the Deployment for a cross-namespace Loki.
const LOKI_URL = process.env.LOKI_URL || 'http://loki:3100'

interface AccessLogEntry {
  timestamp?: string
  method?: string
  path?: string
  statusCode?: number
  duration?: number
  apiId?: string
  requestId?: string
  userIp?: string
  userAgent?: string
  requestBody?: unknown
  responseBody?: unknown
  pod?: string
}

/**
 * Extract the access_log JSON from one Loki line.
 *
 * Two layers of wrapping to peel:
 *  1. Docker json-file runtime stores each line as
 *     `{"log":"<actual line>\n","stream":"stdout","time":"..."}` — Promtail
 *     ships it verbatim, so unwrap `.log` first.
 *  2. The broker's tracing output is ANSI-colored:
 *     `[2m<ts>[0m [32m INFO[0m [2maccess_log[0m: {json}`
 *     The color codes use `[` (square brackets) and sit BEFORE the JSON, so
 *     slicing from the first `{` after "access_log" yields clean JSON.
 */
function parseAccessLine(line: string): AccessLogEntry | null {
  let raw = line
  if (line.startsWith('{') && line.includes('"log"')) {
    try {
      const wrap = JSON.parse(line) as { log?: unknown }
      if (typeof wrap.log === 'string') raw = wrap.log
    } catch {
      /* not docker-wrapped — use as-is */
    }
  }
  const marker = raw.indexOf('access_log')
  if (marker < 0) return null
  const brace = raw.indexOf('{', marker)
  if (brace < 0) return null
  try {
    const o = JSON.parse(raw.slice(brace)) as Record<string, unknown>
    return {
      timestamp: o.timestamp as string,
      method: o.method as string,
      path: o.path as string,
      statusCode: typeof o.statusCode === 'number' ? o.statusCode : undefined,
      duration: typeof o.duration === 'number' ? o.duration : undefined,
      apiId: o.apiId as string,
      requestId: o.requestId as string,
      userIp: o.userIp as string,
      userAgent: o.userAgent as string,
      requestBody: o.requestBody,
      responseBody: o.responseBody,
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const hours = Math.min(parseInt(searchParams.get('hours') || '24'), 168)
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000)
  // Optional substring filter on path (e.g. ?path=/app-a)
  const pathFilter = searchParams.get('path') || ''

  const now = Date.now()
  const startNs = `${now - hours * 3600 * 1000}000000`
  const endNs = `${now}000000`

  // LogQL: broker access_log lines (scoped to the broker app via Promtail's
  // `app` label, then line-filtered to the access_log tracing target).
  const query = '{namespace="orch-dev", app="orch-broker"} |= "access_log"'
  const url =
    `${LOKI_URL}/loki/api/v1/query_range` +
    `?query=${encodeURIComponent(query)}` +
    `&start=${startNs}&end=${endNs}&limit=${limit}&direction=backward`

  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300)
      return NextResponse.json(
        { entries: [], count: 0, error: `Loki ${r.status}`, detail, lokiUrl: LOKI_URL },
        { status: 200 },
      )
    }
    const data = await r.json()
    const result = data?.data?.result ?? []
    const entries: AccessLogEntry[] = []
    for (const stream of result) {
      const pod = stream?.stream?.pod
      for (const [tsNs, line] of stream?.values ?? []) {
        const parsed = parseAccessLine(line)
        if (!parsed) continue
        // Loki line ts is authoritative if the body lacks one.
        if (!parsed.timestamp) parsed.timestamp = new Date(Number(tsNs) / 1e6).toISOString()
        parsed.pod = pod
        if (pathFilter && !(parsed.path || '').includes(pathFilter)) continue
        entries.push(parsed)
      }
    }
    entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    return NextResponse.json({ entries: entries.slice(0, limit), count: entries.length })
  } catch (e) {
    return NextResponse.json(
      { entries: [], count: 0, error: e instanceof Error ? e.message : String(e), lokiUrl: LOKI_URL },
      { status: 200 },
    )
  }
}
