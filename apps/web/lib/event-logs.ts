/**
 * Friendly display for raw `event_logs.eventType` values.
 *
 * The DB stores machine event types (e.g. `microflow-request`, `pattern_match`)
 * that mean nothing to a business user. The UI instead shows:
 *   - a human "kind"  (MICROFLOW, REST API, …)
 *   - the specific flow / operation / rule NAME
 *
 * The name is derived from the event's captured `data`, because
 * `event_logs.flowName` is usually null (the broker's eventLog node only sets
 * it from node config, which APP-A leaves empty). For a microflow event the
 * real flow name rides inside the captured request envelope
 * (`data.<node>.body.flowName`, e.g. "saveSampleAction"); for a proxy
 * pattern match it's the matched rule name (`data.patternName`) or the path.
 */

const KIND_LABELS: Record<string, string> = {
  'microflow-request': 'MICROFLOW',
  'pattern_match': 'REST API',
}

/** Subtle accent per kind (design-system palette). */
const KIND_COLORS: Record<string, string> = {
  MICROFLOW: '#8B5CF6', // purple
  'REST API': '#3B82F6', // blue
}

/**
 * Human "kind" label for a raw eventType. Used where only the type string is
 * known (e.g. the filter list). Unknown types are prettified: slug → UPPER.
 */
export function eventKindLabel(eventType?: string | null): string {
  if (!eventType) return 'EVENT'
  return KIND_LABELS[eventType] ?? eventType.replace(/[-_]/g, ' ').toUpperCase()
}

export function eventKindColor(kind: string): string {
  return KIND_COLORS[kind] ?? '#8B92A5'
}

/** Pull the flow name out of a captured request envelope nested anywhere in data. */
function flowNameFromData(d: Record<string, unknown>): string | null {
  for (const v of Object.values(d)) {
    if (v && typeof v === 'object') {
      const body = (v as Record<string, unknown>).body
      const fn = body && typeof body === 'object' ? (body as Record<string, unknown>).flowName : undefined
      if (typeof fn === 'string' && fn) return fn
    }
  }
  return null
}

/**
 * Kind + specific name for one event row — answers "which flow / operation was
 * this?" without needing a broker change (reads the captured `data`).
 */
export function eventDisplay(log: {
  eventType?: string | null
  data?: unknown
  flowName?: string | null
}): { kind: string; name: string | null; api: string | null; path: string | null; method: string | null } {
  const kind = eventKindLabel(log.eventType)
  let name: string | null =
    typeof log.flowName === 'string' && log.flowName ? log.flowName : null
  let api: string | null = null
  let path: string | null = null
  let method: string | null = null

  const d = log.data
  if (d && typeof d === 'object') {
    const dd = d as Record<string, unknown>
    if (log.eventType === 'pattern_match') {
      if (!name) name = (typeof dd.patternName === 'string' && dd.patternName) || (typeof dd.path === 'string' && dd.path) || null
      path = typeof dd.path === 'string' ? dd.path : null
      method = typeof dd.method === 'string' ? dd.method : null
    } else {
      if (!name) name = flowNameFromData(dd) || (typeof dd.path === 'string' ? dd.path : null)
      // microflow events nest the captured request under a node key:
      // data.<node>.{ body:{ appName, flowName }, path, method }
      for (const v of Object.values(dd)) {
        if (v && typeof v === 'object') {
          const node = v as Record<string, unknown>
          const body = node.body as Record<string, unknown> | undefined
          if (!api && body && typeof body.appName === 'string') api = body.appName
          if (!path && typeof node.path === 'string') path = node.path
          if (!method && typeof node.method === 'string') method = node.method
        }
      }
      if (!path && typeof dd.path === 'string') path = dd.path
    }
  }
  return { kind, name, api, path, method }
}
