import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthPayload } from '@/lib/auth'

// Seed a starter set of global config keys. Idempotent — skips rows
// that already exist (uniqueness on key+projectId=null).
// POST /api/admin/system-config/seed

type SeedRow = {
  key: string
  value: unknown
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'URL' | 'SECRET'
  category:
    | 'GENERAL'
    | 'BACKEND_URLS'
    | 'KAFKA'
    | 'AUDIT'
    | 'SECURITY'
    | 'PERFORMANCE'
    | 'ALERTS'
    | 'FEATURE_FLAGS'
    | 'UI_BRANDING'
  label: string
  description?: string
  group?: string
  isSecret?: boolean
  isRequired?: boolean
  isReadOnly?: boolean
}

const SEED: SeedRow[] = [
  // ------------------ BACKEND URLS ------------------
  {
    key: 'orchBroker.url',
    value: 'http://orch-broker.orch-dev.svc.cluster.local:8047',
    valueType: 'URL',
    category: 'BACKEND_URLS',
    group: 'ORCH',
    label: 'Orch Broker URL',
    description: 'Web → Broker gateway URL. Must be reachable from web pods.',
    isRequired: true,
  },

  // ------------------ KAFKA ------------------
  {
    key: 'kafka.bootstrapServers',
    value: 'orch-kafka:9092',
    valueType: 'STRING',
    category: 'KAFKA',
    label: 'Kafka bootstrap servers',
    description: 'Cluster-local service DNS. The `kafka.orch-dev.svc.cluster.local` NodePort is dead — use `orch-kafka`.',
    isRequired: true,
  },
  {
    key: 'kafka.topics.audit',
    value: 'audit-logs',
    valueType: 'STRING',
    category: 'KAFKA',
    label: 'Kafka topic for audit log',
    isRequired: true,
  },
  {
    key: 'kafka.topics.event',
    value: 'event-logs',
    valueType: 'STRING',
    category: 'KAFKA',
    label: 'Kafka topic for event log',
    isRequired: true,
  },

  // ------------------ AUDIT POLICY ------------------
  {
    key: 'audit.strictWriteOnly',
    value: true,
    valueType: 'BOOLEAN',
    category: 'AUDIT',
    label: 'Audit write operations only',
    description: 'When true, only SIGNOFF/SUBMIT/APPROVE/REJECT/CREATE/UPDATE/DELETE go to audit_logs; reads go to event_logs only.',
  },
  {
    key: 'audit.retentionDays',
    value: 365,
    valueType: 'NUMBER',
    category: 'AUDIT',
    label: 'audit_logs retention (days)',
    description: 'Audit records older than this are pruned by the daily cleanup job. 0 = keep forever.',
  },
  {
    key: 'logs.retentionDays',
    value: 30,
    valueType: 'NUMBER',
    category: 'AUDIT',
    label: 'api_logs retention (days)',
    description: 'API call logs (method/path/status/duration/body). Keep shorter — volume is high.',
  },
  {
    key: 'events.retentionDays',
    value: 30,
    valueType: 'NUMBER',
    category: 'AUDIT',
    label: 'event_logs retention (days)',
    description: 'Event log entries emitted by eventLog nodes.',
  },
  {
    key: 'retention.cronSchedule',
    value: '0 3 * * *',
    valueType: 'STRING',
    category: 'AUDIT',
    label: 'Cron schedule (UTC) for cleanup job',
    description: 'Default: daily at 03:00 UTC. Uses standard 5-field cron syntax.',
  },
  {
    key: 'audit.requireMessageFormat',
    value: true,
    valueType: 'BOOLEAN',
    category: 'AUDIT',
    label: 'Audit only when MessageFormat matches',
    description: 'Skip audit when request does not match any registered MessageFormat.',
  },

  // ------------------ SECURITY ------------------
  {
    key: 'security.jwtTtlMinutes',
    value: 60,
    valueType: 'NUMBER',
    category: 'SECURITY',
    label: 'JWT TTL (minutes)',
  },
  {
    key: 'security.cors.allowedOrigins',
    value: ['https://sit.orch.example.com'],
    valueType: 'JSON',
    category: 'SECURITY',
    label: 'CORS allowed origins',
  },
  {
    key: 'security.rateLimitPerMinute',
    value: 600,
    valueType: 'NUMBER',
    category: 'SECURITY',
    label: 'Rate limit per IP per minute',
  },

  // ------------------ PERFORMANCE ------------------
  {
    key: 'perf.apiRegistryCacheTtlSec',
    value: 60,
    valueType: 'NUMBER',
    category: 'PERFORMANCE',
    label: 'API registry cache TTL (seconds)',
  },
  {
    key: 'perf.brokerTimeoutMs',
    value: 30000,
    valueType: 'NUMBER',
    category: 'PERFORMANCE',
    label: 'Broker call timeout (ms)',
  },
  {
    key: 'perf.circuitBreakerThreshold',
    value: 5,
    valueType: 'NUMBER',
    category: 'PERFORMANCE',
    label: 'Consecutive failures before opening circuit',
  },
  {
    key: 'broker.l1NegativeCacheTtlSecs',
    value: 300,
    valueType: 'NUMBER',
    category: 'PERFORMANCE',
    label: 'L1 negative cache TTL (seconds)',
    description: 'How long the broker remembers an unresolved API path before re-fetching the registry. 0 disables.',
  },
  {
    key: 'broker.l2ResolveCacheTtlSecs',
    value: 300,
    valueType: 'NUMBER',
    category: 'PERFORMANCE',
    label: 'L2 resolve cache TTL (seconds)',
    description: 'How long the broker caches the project resolve-by-path response (Level 2 fallback). 0 disables.',
  },

  // ------------------ ALERTS ------------------
  {
    key: 'alerts.slackWebhook',
    value: '',
    valueType: 'SECRET',
    category: 'ALERTS',
    label: 'Slack webhook for alerts',
    isSecret: true,
  },
  {
    key: 'alerts.errorRateThreshold',
    value: 0.05,
    valueType: 'NUMBER',
    category: 'ALERTS',
    label: 'Threshold error rate (0.05 = 5%)',
  },

  // ------------------ FEATURE FLAGS ------------------
  {
    key: 'features.auditUi.enabled',
    value: true,
    valueType: 'BOOLEAN',
    category: 'FEATURE_FLAGS',
    label: 'Enable Audit UI page',
  },
  {
    key: 'features.reportsPage.enabled',
    value: true,
    valueType: 'BOOLEAN',
    category: 'FEATURE_FLAGS',
    label: 'Enable Reports page',
  },
  {
    key: 'features.autoDiscoverFormats',
    value: false,
    valueType: 'BOOLEAN',
    category: 'FEATURE_FLAGS',
    label: 'Auto-discover MessageFormats from traffic',
  },

  // ------------------ BROKER (used by Rust broker) ------------------
  {
    key: 'orch.defaultBackendUrl',
    value: '',
    valueType: 'URL',
    category: 'BACKEND_URLS',
    group: 'ORCH',
    label: 'Default Backend URL (broker Level 3 fallback)',
    description: 'Optional — broker falls back to this URL when no route matches. Leave empty to disable.',
  },
  {
    key: 'security.maxRequestSizeMb',
    value: 10,
    valueType: 'NUMBER',
    category: 'SECURITY',
    label: 'Max request body size (MB)',
  },
  {
    key: 'security.ipWhitelist',
    value: '',
    valueType: 'STRING',
    category: 'SECURITY',
    label: 'IP whitelist (comma-separated)',
    description: 'Comma-separated IPs or CIDR blocks (e.g. "1.2.3.4, 10.0.0.0/8"). Empty = no whitelist.',
  },
  {
    key: 'security.ipBlacklist',
    value: '',
    valueType: 'STRING',
    category: 'SECURITY',
    label: 'IP blacklist (comma-separated)',
    description: 'Blacklist takes priority over whitelist. Empty = no blacklist.',
  },
  {
    key: 'mq.provider',
    value: 'kafka',
    valueType: 'STRING',
    category: 'KAFKA',
    label: 'MQ provider (kafka / rabbitmq)',
  },
  {
    key: 'mq.rabbitmqUrl',
    value: 'amqp://localhost:5672',
    valueType: 'URL',
    category: 'KAFKA',
    label: 'RabbitMQ URL (used when mq.provider=rabbitmq)',
  },
  {
    key: 'service.registry',
    value: '{}',
    valueType: 'JSON',
    category: 'BACKEND_URLS',
    label: 'Service registry (JSON mapping name → base URL)',
    description: 'Optional JSON object mapping internal service names to base URLs. Used by broker action handlers.',
  },

  // ------------------ UI BRANDING ------------------
  {
    key: 'ui.appName',
    value: 'Orch',
    valueType: 'STRING',
    category: 'UI_BRANDING',
    label: 'App name (shown in header)',
  },
]

export async function POST(req: NextRequest) {
  const payload = getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const roles = payload.roles || []
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let created = 0
  let skipped = 0
  for (const r of SEED) {
    const exists = await prisma.systemConfig.findFirst({
      where: { key: r.key, projectId: null },
    })
    if (exists) {
      skipped++
      continue
    }
    await prisma.systemConfig.create({
      data: {
        key: r.key,
        value: r.value as never,
        valueType: r.valueType,
        category: r.category,
        label: r.label,
        description: r.description,
        group: r.group,
        isSecret: r.isSecret ?? false,
        isRequired: r.isRequired ?? false,
        isReadOnly: r.isReadOnly ?? false,
        defaultValue: r.value as never,
        updatedBy: payload.userId,
      },
    })
    created++
  }

  return NextResponse.json({ success: true, created, skipped, total: SEED.length })
}

// GET — preview what will be seeded
export async function GET() {
  return NextResponse.json({ data: SEED, total: SEED.length })
}
