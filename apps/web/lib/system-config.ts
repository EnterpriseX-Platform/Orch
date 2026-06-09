/**
 * system-config.ts — Runtime configuration accessor.
 *
 * Resolves config values in this order:
 *   1. In-memory cache (60s TTL) — keeps hot reads cheap
 *   2. DB `system_configs` row (project-scoped → global)
 *   3. Environment variable fallback (for bootstrap / migration-in-progress)
 *   4. Hard-coded default supplied by caller
 *
 * Never cache secrets longer than 10s. Call `invalidateConfig(key)` after
 * an admin updates a value to propagate within one process tick; other
 * pods pick up on the next TTL expiry.
 *
 * Do NOT store passwords or API keys here — use K8s secrets / env.
 */
import { prisma } from './prisma'

type CacheEntry = { value: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>()

const DEFAULT_TTL_MS = 60_000 // 60s for normal values
const SECRET_TTL_MS = 10_000 // 10s for secrets

function cacheKey(key: string, projectId?: string | null) {
  return `${projectId ?? '_global'}::${key}`
}

export interface GetConfigOptions<T> {
  /** Project-scoped override. If unset or no override row, falls back to global. */
  projectId?: string | null
  /** Hard-coded default if no DB row AND no env var. */
  defaultValue?: T
  /** Env var name to check as fallback before returning defaultValue. */
  envVar?: string
  /** Skip cache (force DB read). */
  noCache?: boolean
}

/**
 * Get a config value by key. Type-safe via generic.
 *
 * @example
 *   const brokerUrl = await getConfig<string>('orchBroker.url', {
 *     envVar: 'ORCH_BROKER_URL',
 *     defaultValue: 'http://localhost:8047',
 *   })
 */
export async function getConfig<T = unknown>(
  key: string,
  opts: GetConfigOptions<T> = {},
): Promise<T | undefined> {
  const { projectId = null, defaultValue, envVar, noCache } = opts
  const ck = cacheKey(key, projectId)

  if (!noCache) {
    const hit = cache.get(ck)
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T
    }
  }

  // DB lookup — prefer project override, fall back to global
  // Prisma v6 does not allow null in a compound-unique key, so use findFirst
  // when projectId is null (the @@unique index still enforces uniqueness).
  let row = null
  if (projectId) {
    row = await prisma.systemConfig.findFirst({ where: { key, projectId } })
  }
  if (!row) {
    row = await prisma.systemConfig.findFirst({ where: { key, projectId: null } })
  }

  let value: unknown
  if (row) {
    value = row.value
  } else if (envVar && process.env[envVar] !== undefined) {
    value = process.env[envVar]
  } else if (defaultValue !== undefined) {
    value = defaultValue
  } else {
    value = undefined
  }

  const ttl = row?.isSecret ? SECRET_TTL_MS : DEFAULT_TTL_MS
  cache.set(ck, { value, expiresAt: Date.now() + ttl })
  return value as T | undefined
}

/**
 * Get multiple config values in one round-trip.
 * Still applies per-key env var fallback and cache.
 */
export async function getConfigs<T extends Record<string, unknown>>(
  keys: readonly (keyof T & string)[],
  opts: Omit<GetConfigOptions<unknown>, 'defaultValue' | 'envVar'> & {
    defaults?: Partial<T>
    envVars?: Partial<Record<keyof T & string, string>>
  } = {},
): Promise<Partial<T>> {
  const { projectId = null, defaults, envVars } = opts
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    out[key] = await getConfig(key, {
      projectId,
      defaultValue: defaults?.[key] as T[typeof key] | undefined,
      envVar: envVars?.[key],
    })
  }
  return out as Partial<T>
}

/** Invalidate a single key (all scopes). Called after admin write. */
export function invalidateConfig(key: string) {
  for (const ck of cache.keys()) {
    if (ck.endsWith(`::${key}`)) cache.delete(ck)
  }
}

/** Nuke the whole cache. Use sparingly — breaks throughput briefly. */
export function invalidateAllConfig() {
  cache.clear()
}

// ==========================================================================
// Named helpers — single source of truth for each runtime knob.
//
// Instead of scattering `getConfig('orchBroker.url', { envVar: '...' })`
// across handlers, route through these helpers so:
//   - env-var name lives in exactly ONE place
//   - DB key lives in exactly ONE place
//   - defaults + docs are co-located
// Callers just do `await getBrokerUrl()`.
// ==========================================================================

/**
 * URL of the Orch Broker (internal service).
 * - DB key: `orchBroker.url`
 * - env fallback: ORCH_BROKER_URL
 * - default:   http://localhost:8047 (local dev)
 */
export function getBrokerUrl(): Promise<string> {
  return getConfig<string>('orchBroker.url', {
    envVar: 'ORCH_BROKER_URL',
    defaultValue: 'http://localhost:8047',
  }) as Promise<string>
}

/**
 * Kafka bootstrap servers (comma-separated host:port list).
 * - DB key: `kafka.bootstrapServers`
 * - env fallback: KAFKA_BROKERS
 * - default:   localhost:9092
 */
export function getKafkaBootstrap(): Promise<string> {
  return getConfig<string>('kafka.bootstrapServers', {
    envVar: 'KAFKA_BROKERS',
    defaultValue: 'localhost:9092',
  }) as Promise<string>
}

/**
 * Kafka topic used to record audit logs.
 * DB key: `kafka.topics.audit`, default: `audit-logs`
 */
export function getAuditTopic(): Promise<string> {
  return getConfig<string>('kafka.topics.audit', {
    envVar: 'KAFKA_AUDIT_TOPIC',
    defaultValue: 'audit-logs',
  }) as Promise<string>
}

/**
 * Kafka topic used to record event logs.
 * DB key: `kafka.topics.event`, default: `event-logs`
 */
export function getEventTopic(): Promise<string> {
  return getConfig<string>('kafka.topics.event', {
    envVar: 'KAFKA_EVENT_TOPIC',
    defaultValue: 'event-logs',
  }) as Promise<string>
}

/**
 * Boolean feature flag value (true/false).
 * If not present in the DB or env → use defaultValue (default: false)
 */
export async function getFeatureFlag(key: string, defaultValue = false): Promise<boolean> {
  const v = await getConfig<boolean>(`features.${key}`, { defaultValue })
  return v ?? defaultValue
}

/**
 * Numeric config value (integer / decimal) with a default.
 * Used for timeouts, TTLs, and various thresholds.
 */
export async function getNumberConfig(key: string, defaultValue: number): Promise<number> {
  const v = await getConfig<number | string>(key, { defaultValue })
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return defaultValue
}

/**
 * Write a config value and record history.
 * Returns the updated row.
 */
export async function setConfig(params: {
  key: string
  value: unknown
  userId: string
  projectId?: string | null
  reason?: string
}) {
  const { key, value, userId, projectId = null, reason } = params

  const existing = await prisma.systemConfig.findFirst({
    where: { key, projectId },
  })

  if (existing?.isReadOnly) {
    throw new Error(`Config key "${key}" is read-only`)
  }

  const row = existing
    ? await prisma.systemConfig.update({
        where: { id: existing.id },
        data: { value: value as never, updatedBy: userId },
      })
    : await prisma.systemConfig.create({
        data: {
          key,
          value: value as never,
          projectId,
          updatedBy: userId,
        },
      })

  await prisma.systemConfigHistory.create({
    data: {
      configKey: key,
      projectId,
      oldValue: (existing?.value ?? null) as never,
      newValue: value as never,
      changedBy: userId,
      reason,
    },
  })

  invalidateConfig(key)
  return row
}
