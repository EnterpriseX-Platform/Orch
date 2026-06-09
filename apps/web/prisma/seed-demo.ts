/**
 * Seed Demo Data for Orch
 * Creates 1 project "JSONPlaceholder API" with 5 API registrations,
 * 1 shared flow (reused by all APIs), message formats (audit enabled),
 * audit trail, and event logs.
 *
 * Usage: npx tsx prisma/seed-demo.ts
 */

const BASE = 'http://localhost:3047/orch/api'
const BROKER = 'http://localhost:8047'
const USER_ID = '00000000-0000-0000-0000-000000000001'

async function api(path: string, method: string = 'GET', body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) {
    console.error(`  [${res.status}] ${method} ${path}:`, JSON.stringify(data).slice(0, 200))
    throw new Error(`API call failed: ${method} ${path} → ${res.status}`)
  }
  return data
}

async function main() {
  console.log('=== Orch Demo Seed ===\n')

  // ────────────────────────────────────────
  // 1. Create Project
  // ────────────────────────────────────────
  console.log('1. Creating Project: JSONPlaceholder API...')
  const project = await api('/projects', 'POST', {
    name: 'JSONPlaceholder API',
    nameEn: 'JSONPlaceholder API',
    description: 'Demo project using JSONPlaceholder - a free fake REST API for testing and prototyping. Provides users, posts, comments, albums, photos, and todos endpoints.',
    baseUrl: 'https://jsonplaceholder.typicode.com',
    authType: 'NONE',
    projectGroup: 'Demo & Testing',
    agency: 'Orch Team',
    themeColor: '#3B82F6',
    tags: ['demo', 'testing', 'rest-api', 'jsonplaceholder'],
    owner: 'Admin',
    contactEmail: 'admin@orchio.dev',
    status: 'ACTIVE',
    createdBy: USER_ID,
  })
  const projectId = project.id
  console.log(`   ✓ Project created: ${projectId} (${project.slug})\n`)

  // ────────────────────────────────────────
  // 2. Create 1 Generic Flow (reused by ALL APIs)
  // ────────────────────────────────────────
  // This flow uses ${backendUrl} from the API registration context,
  // so it works with any API without hardcoding URLs.
  //
  // Template variables available in broker:
  //   ${requestId}         - Unique request ID
  //   ${flowId}            - Current flow ID
  //   ${backendUrl}        - Backend URL from API registration (camelCase!)
  //   ${request.method}    - HTTP method (GET, POST, etc.)
  //   ${request.path}      - Request path
  //   ${request.clientIp}  - Client IP address
  //   ${extracted.*}       - Values set by extract node (e.g., ${extracted.apiId})
  //   ${proxy.statusCode}  - HTTP status code from proxy response
  //   ${proxy.durationMs}  - Duration in ms for proxy call
  //   ${proxy.response}    - Full proxy response body
  console.log('2. Creating Generic API Gateway Flow...')
  const flow = await api('/flows', 'POST', {
    name: 'API Gateway Flow',
    description: 'Generic flow: extract → proxy to backendUrl → event log + audit trail → response. Reused by all APIs in the project.',
    triggerType: 'HTTP',
    executionMode: 'SYNC',
    flowCategory: 'API_GATEWAY',
    createdBy: USER_ID,
    nodes: [
      {
        id: 'node-extract',
        type: 'extract',
        position: { x: 100, y: 200 },
        data: {
          type: 'extract',
          label: 'Extract Request',
          sub: 'Parse Data',
          icon: 'E',
          color: '#7C3AED',
          config: {
            fields: [
              { name: 'clientIp', source: 'context', path: 'request.client_ip' },
              { name: 'userAgent', source: 'headers', path: 'user-agent' },
              { name: 'requestPath', source: 'context', path: 'request.path' },
              { name: 'requestMethod', source: 'context', path: 'request.method' },
              { name: 'apiId', source: 'context', path: 'api_registration.id' },
              { name: 'apiName', source: 'context', path: 'api_registration.name' },
            ],
          },
        },
      },
      {
        id: 'node-proxy',
        type: 'proxy',
        position: { x: 400, y: 200 },
        data: {
          type: 'proxy',
          label: 'Proxy to Backend',
          sub: 'Forward Request',
          icon: 'P',
          color: '#10B981',
          config: {
            // Uses ${backendUrl} from API registration context (camelCase!)
            targetUrl: '${backendUrl}',
            method: '${request.method}',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-Request-Id': '${requestId}',
              'X-Forwarded-For': '${extracted.clientIp}',
            },
            timeout: 15000,
            useInput: true,
          },
        },
      },
      {
        id: 'node-event-log',
        type: 'eventLog',
        position: { x: 700, y: 200 },
        data: {
          type: 'eventLog',
          label: 'Event Log',
          sub: 'System Event',
          icon: 'L',
          color: '#64748B',
          config: {
            event: 'API_GATEWAY_CALL',
            level: 'info',
            message: '${extracted.requestMethod} ${extracted.requestPath} → ${proxy.statusCode}',
            data: {
              apiId: '${extracted.apiId}',
              apiName: '${extracted.apiName}',
              method: '${extracted.requestMethod}',
              path: '${extracted.requestPath}',
              statusCode: '${proxy.statusCode}',
              durationMs: '${proxy.durationMs}',
              clientIp: '${extracted.clientIp}',
            },
          },
        },
      },
      {
        id: 'node-audit',
        type: 'audit',
        position: { x: 1000, y: 200 },
        data: {
          type: 'audit',
          label: 'Audit Trail',
          sub: 'Security Log',
          icon: 'A',
          color: '#64748B',
          config: {
            action: 'VIEW',
            entityType: 'API',
            entityId: '${extracted.apiId}',
            changes: {
              method: { old: null, new: '${extracted.requestMethod}' },
              path: { old: null, new: '${extracted.requestPath}' },
              statusCode: { old: null, new: '${proxy.statusCode}' },
              durationMs: { old: null, new: '${proxy.durationMs}' },
            },
          },
        },
      },
      {
        id: 'node-response',
        type: 'response',
        position: { x: 1300, y: 200 },
        data: {
          type: 'response',
          label: 'HTTP Response',
          sub: 'Return 200',
          icon: 'R',
          color: '#EF4444',
          config: {
            statusCode: 200,
            bodySource: 'proxy.response',
            headers: {
              'Content-Type': 'application/json',
              'X-Powered-By': 'Orch',
              'X-Request-Id': '${requestId}',
              'X-Flow-Duration': '${proxy.durationMs}ms',
            },
          },
        },
      },
    ],
    // Sequential edges: extract → proxy → eventLog → audit → response
    // (SDK flow executor follows single-path, so nodes must be sequential)
    edges: [
      { id: 'e-extract-proxy', source: 'node-extract', target: 'node-proxy', animated: true },
      { id: 'e-proxy-eventlog', source: 'node-proxy', target: 'node-event-log', animated: true },
      { id: 'e-eventlog-audit', source: 'node-event-log', target: 'node-audit', animated: true },
      { id: 'e-audit-response', source: 'node-audit', target: 'node-response', animated: true },
    ],
  })
  const flowId = flow.id
  console.log(`   ✓ Flow created: ${flow.name} → ${flowId}\n`)

  // ────────────────────────────────────────
  // 3. Create API Registrations (5 APIs, all linked to the same flow)
  // ────────────────────────────────────────
  console.log('3. Registering APIs (all linked to the shared flow)...')

  const apiDefs = [
    {
      name: 'List Users',
      description: 'Get all users from JSONPlaceholder. Returns array of 10 users with name, email, address, phone, website, and company info.',
      endpoint: '/api/v1/users',
      method: 'GET' as const,
      backendUrl: 'https://jsonplaceholder.typicode.com/users',
      version: '1.0.0',
      tags: ['users', 'list'],
    },
    {
      name: 'Get User By ID',
      description: 'Get a specific user by ID. Returns user details including address (geo coordinates), phone, website, and company.',
      endpoint: '/api/v1/users/:id',
      method: 'GET' as const,
      backendUrl: 'https://jsonplaceholder.typicode.com/users/{id}',
      version: '1.0.0',
      tags: ['users', 'detail'],
    },
    {
      name: 'List Posts',
      description: 'Get all posts from JSONPlaceholder. Returns array of 100 posts each with userId, title, and body.',
      endpoint: '/api/v1/posts',
      method: 'GET' as const,
      backendUrl: 'https://jsonplaceholder.typicode.com/posts',
      version: '1.0.0',
      tags: ['posts', 'list'],
    },
    {
      name: 'Create Post',
      description: 'Create a new post. Accepts JSON body with title, body, and userId. Returns created post with assigned ID.',
      endpoint: '/api/v1/posts',
      method: 'POST' as const,
      backendUrl: 'https://jsonplaceholder.typicode.com/posts',
      version: '1.0.0',
      tags: ['posts', 'create'],
    },
    {
      name: 'List Todos',
      description: 'Get all todos from JSONPlaceholder. Returns array of 200 todos each with userId, title, and completed status.',
      endpoint: '/api/v1/todos',
      method: 'GET' as const,
      backendUrl: 'https://jsonplaceholder.typicode.com/todos',
      version: '1.0.0',
      tags: ['todos', 'list'],
    },
  ]

  const createdApis: any[] = []
  for (const def of apiDefs) {
    const created = await api('/registers', 'POST', {
      ...def,
      projectId,
      apiType: 'REST',
      rateLimitPerMin: 100,
      timeout: 30,
      retries: 2,
      status: 'ACTIVE',
      flowId,  // All APIs share the same flow
      createdBy: USER_ID,
    })
    createdApis.push(created)
    console.log(`   ✓ API: ${created.name} [${created.method}] ${created.endpoint} → ${created.id}`)
  }
  console.log()

  // ────────────────────────────────────────
  // 4. Create Message Formats (audit enabled for each API)
  // ────────────────────────────────────────
  console.log('4. Creating Message Formats (audit enabled)...')
  for (const apiReg of createdApis) {
    const msgFormat = await api('/message/formats', 'POST', {
      name: `${apiReg.name} Format`,
      description: `Audit-enabled message format for ${apiReg.name} [${apiReg.method}] ${apiReg.endpoint}`,
      apiRegistrationId: apiReg.id,
      discriminatorSource: 'NONE',
      auditEnabled: true,
      pkXPath: '$.id',
      auditFields: [
        { id: 'f1', fieldName: 'id', fieldPath: '$.id', fieldType: 'string', description: 'Resource ID' },
        { id: 'f2', fieldName: 'name', fieldPath: '$.name', fieldType: 'string', description: 'Resource name' },
      ],
      extractionConfig: {
        responseFormat: 'JSON',
        rootPath: '$',
      },
      fieldMappings: [
        { id: 'm1', sourceField: 'id', targetField: 'entityId', fieldType: 'string', description: 'Map ID to entity ID' },
      ],
      status: 'ACTIVE',
      createdBy: USER_ID,
    })
    console.log(`   ✓ MessageFormat: ${msgFormat.name} (audit=${msgFormat.auditEnabled}) → ${msgFormat.id}`)
  }
  console.log()

  // ────────────────────────────────────────
  // 5. Create Audit Trail entries (seed data for initial setup actions)
  // ────────────────────────────────────────
  console.log('5. Creating Audit Trail entries...')
  const auditEntries = [
    {
      action: 'CREATE',
      entityType: 'Project',
      entityId: projectId,
      description: `Created project: ${project.name}`,
      newValues: { name: project.name, baseUrl: project.baseUrl, status: 'ACTIVE' },
    },
    {
      action: 'CREATE',
      entityType: 'Flow',
      entityId: flowId,
      description: `Created flow: ${flow.name}`,
      newValues: { name: flow.name, triggerType: 'HTTP', executionMode: 'SYNC', nodes: 5, edges: 5 },
    },
    ...createdApis.map((a: any) => ({
      action: 'CREATE',
      entityType: 'API',
      entityId: a.id,
      description: `Registered API: ${a.name} [${a.method}] ${a.endpoint}`,
      newValues: { name: a.name, endpoint: a.endpoint, method: a.method, backendUrl: a.backendUrl, flowId },
    })),
  ]

  for (const entry of auditEntries) {
    await api('/audit', 'POST', {
      ...entry,
      userId: USER_ID,
      userIp: '127.0.0.1',
      timestamp: new Date().toISOString(),
    })
  }
  console.log(`   ✓ Created ${auditEntries.length} audit entries\n`)

  // ────────────────────────────────────────
  // 6. Deploy Flow to Broker
  // ────────────────────────────────────────
  console.log('6. Deploying Flow to Broker...')
  try {
    const result = await api(`/flows/${flowId}/deploy`, 'POST')
    console.log(`   ✓ Deployed: ${flow.name} → ${result.success ? 'OK' : 'FAILED'}\n`)
  } catch (e: any) {
    console.log(`   ⚠ Deploy failed: ${e.message}\n`)
  }

  // ────────────────────────────────────────
  // 7. Test: Call all APIs through broker
  // ────────────────────────────────────────
  console.log('7. Testing API calls through Broker...')
  const testEndpoints = [
    { path: '/api/v1/users', label: 'List Users' },
    { path: '/api/v1/posts', label: 'List Posts' },
    { path: '/api/v1/todos', label: 'List Todos' },
  ]

  for (const test of testEndpoints) {
    try {
      const start = Date.now()
      const res = await fetch(`${BROKER}${test.path}`, {
        headers: { 'Accept': 'application/json' },
      })
      const duration = Date.now() - start
      const body = await res.text()

      if (res.ok) {
        const data = JSON.parse(body)
        const count = Array.isArray(data) ? data.length : (data.data ? data.data.length : '?')
        console.log(`   ✓ ${test.label}: ${res.status} OK (${count} items, ${duration}ms)`)
      } else {
        console.log(`   ✗ ${test.label}: ${res.status} (${duration}ms) - ${body.slice(0, 100)}`)
      }
    } catch (e: any) {
      console.log(`   ✗ ${test.label}: ${e.message}`)
    }
  }
  console.log()

  // ────────────────────────────────────────
  // 8. Verify: Check Event Logs and Audit Logs
  // ────────────────────────────────────────
  console.log('8. Verifying Event Logs & Audit Trail...')
  try {
    // Check event logs
    const events = await api('/events?limit=5')
    console.log(`   Event Logs: ${events.total} total`)
    if (events.data?.length > 0) {
      const latest = events.data[0]
      console.log(`   Latest event: ${latest.eventType} - ${latest.message}`)
      if (latest.data) {
        const hasResolved = typeof latest.data.statusCode === 'string' && !latest.data.statusCode.includes('${')
        console.log(`   Template resolution: ${hasResolved ? '✓ RESOLVED' : '✗ UNRESOLVED (raw templates)'}`)
        console.log(`   Data: ${JSON.stringify(latest.data).slice(0, 150)}`)
      }
    }

    // Check audit logs
    const audit = await api('/audit?limit=5')
    console.log(`   Audit Logs: ${audit.total} total`)
    if (audit.data?.length > 0) {
      const latest = audit.data[0]
      console.log(`   Latest audit: ${latest.action} ${latest.entityType} ${latest.entityId || ''}`)
      if (latest.changes) {
        console.log(`   Changes: ${JSON.stringify(latest.changes).slice(0, 150)}`)
      }
    }
  } catch (e: any) {
    console.log(`   ⚠ Verification failed: ${e.message}`)
  }
  console.log()

  // ────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────
  console.log('=== Seed Complete ===')
  console.log(`  Project:  ${project.name} (${projectId})`)
  console.log(`  Flow:     ${flow.name} (${flowId}) — shared by all APIs`)
  console.log(`  APIs:     ${createdApis.length} registered`)
  console.log(`  MsgFmts:  ${createdApis.length} with audit enabled`)
  console.log(`  Audit:    ${auditEntries.length} entries`)
  console.log()
  console.log('  Web UI:   http://localhost:3047/orch/projects')
  console.log(`  Project:  http://localhost:3047/orch/projects/${projectId}`)
  console.log(`  Flow:     http://localhost:3047/orch/flows/builder/${flowId}`)
  console.log(`  Audit:    http://localhost:3047/orch/audit`)
  console.log(`  Events:   http://localhost:3047/orch/events`)
}

main().catch((e) => {
  console.error('\n✗ Seed failed:', e.message)
  process.exit(1)
})
