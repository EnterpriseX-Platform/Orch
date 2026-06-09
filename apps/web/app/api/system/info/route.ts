/**
 * /api/system/info — real values for Settings → System Info.
 *
 * Replaces the hardcoded mock (`localhost:5447`, Kafka `7.5.0`, etc.)
 * that the tab used to display regardless of what was actually
 * running. Pulls:
 *
 *   • DB     — parse DATABASE_URL for host/port/db + reachability probe
 *   • Broker — resolve via getBrokerUrl() (system_configs → env), probe /health
 *   • Kafka  — brokers from system_configs (getKafkaBootstrap)
 *   • App    — version/env/node from package + process
 *
 * No uptime yet (process uptime is per-pod; cluster-level requires
 * an extra data source). The field is returned as "—" instead of an
 * invented mock value.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBrokerUrl, getKafkaBootstrap } from '@/lib/system-config'

function parsePg(url: string | undefined) {
  if (!url) return { host: null, port: null, db: null }
  try {
    const u = new URL(url)
    return {
      host: u.hostname || null,
      port: u.port ? Number(u.port) : 5432,
      db: u.pathname.replace(/^\//, '') || null,
    }
  } catch {
    return { host: null, port: null, db: null }
  }
}

export async function GET() {
  const dbUrl = process.env.DATABASE_URL
  const { host: dbHost, port: dbPort, db: dbName } = parsePg(dbUrl)

  // DB probe
  let dbStatus: 'connected' | 'disconnected' = 'disconnected'
  let dbVersion: string | null = null
  try {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() as version`
    dbStatus = 'connected'
    // Keep just "PostgreSQL 15.4" out of the full version banner.
    const m = rows?.[0]?.version?.match(/PostgreSQL\s+\d+(\.\d+)?/)
    dbVersion = m?.[0] || null
  } catch {
    dbStatus = 'disconnected'
  }

  // Broker probe
  const brokerUrl = await getBrokerUrl().catch(() => '')
  let brokerStatus: 'running' | 'stopped' = 'stopped'
  let brokerVersion: string | null = null
  try {
    const r = await fetch(`${brokerUrl}/health`, { signal: AbortSignal.timeout(3000) })
    if (r.ok) {
      brokerStatus = 'running'
      const body = (await r.json().catch(() => ({}))) as { version?: string }
      brokerVersion = body?.version || null
    }
  } catch {
    // offline
  }
  const brokerPortMatch = brokerUrl.match(/:(\d+)(\/|$)/)
  const brokerPort = brokerPortMatch ? Number(brokerPortMatch[1]) : null

  // Kafka — resolved bootstrap string may include one or many brokers.
  const kafkaBootstrap = await getKafkaBootstrap().catch(() => '')
  const kafkaBrokers = kafkaBootstrap ? kafkaBootstrap.split(',').map((b) => b.trim()) : []

  return NextResponse.json({
    database: {
      status: dbStatus,
      type: 'PostgreSQL',
      host: dbHost,
      port: dbPort,
      database: dbName,
      version: dbVersion,
    },
    kafka: {
      // We report the configured brokers; deep reachability is checked
      // by the broker process, not here, to keep this route cheap.
      brokers: kafkaBrokers,
      configured: kafkaBrokers.length > 0,
    },
    broker: {
      status: brokerStatus,
      url: brokerUrl,
      port: brokerPort,
      version: brokerVersion,
      basePath: '/orch',
    },
    system: {
      version: process.env.APP_VERSION || process.env.npm_package_version || null,
      environment: process.env.NODE_ENV || 'production',
      nodeVersion: process.version,
      basePath: '/orch',
    },
    timestamp: new Date().toISOString(),
  })
}
