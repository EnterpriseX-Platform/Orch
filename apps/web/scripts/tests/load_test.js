import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ==========================================
// Load Test Configuration
// ==========================================

// Custom metrics
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');
const successfulRequests = new Counter('successful_requests');

// Test options
export const options = {
  stages: [
    // Ramp up
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '2m', target: 500 },   // Ramp up to 500 users
    { duration: '2m', target: 1000 },  // Ramp up to 1000 users (target: 8000 TPS)
    
    // Steady state
    { duration: '5m', target: 1000 },  // Stay at 1000 users for 5 minutes
    
    // Ramp down
    { duration: '1m', target: 500 },   // Ramp down to 500
    { duration: '1m', target: 100 },   // Ramp down to 100
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests must complete within 500ms
    http_req_failed: ['rate<0.01'],     // Error rate must be below 1%
    errors: ['rate<0.01'],
  },
};

// Base URL
const BASE_URL = __ENV.ORCH_BROKER_URL || 'http://localhost:8047';

// Test data generators
function generateSmallPayload() {
  return JSON.stringify({
    userId: `user-${Math.random().toString(36).substring(7)}`,
    amount: Math.floor(Math.random() * 100000),
    currency: ['THB', 'USD', 'EUR'][Math.floor(Math.random() * 3)],
    description: 'Test payment',
    timestamp: new Date().toISOString(),
  });
}

function generateMediumPayload() {
  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push({
      id: `item-${i}`,
      name: `Product ${i}`,
      price: Math.floor(Math.random() * 10000),
      quantity: Math.floor(Math.random() * 100),
    });
  }
  
  return JSON.stringify({
    userId: `user-${Math.random().toString(36).substring(7)}`,
    amount: Math.floor(Math.random() * 100000),
    currency: 'THB',
    description: 'Test payment with items',
    items: items,
    metadata: {
      source: 'load-test',
      version: '1.0',
    },
  });
}

function generateLargePayload() {
  const items = [];
  for (let i = 0; i < 100; i++) {
    items.push({
      id: `item-${i}`,
      name: `Product ${i} ${'x'.repeat(50)}`,
      price: Math.floor(Math.random() * 10000),
      quantity: Math.floor(Math.random() * 100),
      metadata: {
        category: ['food', 'electronics', 'clothing', 'books'][Math.floor(Math.random() * 4)],
        tags: Array.from({ length: 10 }, (_, j) => `tag-${j}`),
        attributes: Object.fromEntries(
          Array.from({ length: 20 }, (_, k) => [`attr-${k}`, `value-${k}`])
        ),
      },
    });
  }
  
  return JSON.stringify({
    userId: `user-${Math.random().toString(36).substring(7)}`,
    amount: Math.floor(Math.random() * 100000),
    currency: 'THB',
    description: 'Large test payment',
    items: items,
    metadata: {
      source: 'load-test',
      version: '1.0',
      timestamp: new Date().toISOString(),
    },
  });
}

// ==========================================
// Test Scenarios
// ==========================================

export default function () {
  const requestId = `load-${__VU}-${__ITER}-${Date.now()}`;
  
  // Randomly choose payload size (70% small, 20% medium, 10% large)
  const rand = Math.random();
  let payload;
  let payloadType;
  
  if (rand < 0.7) {
    payload = generateSmallPayload();
    payloadType = 'small';
  } else if (rand < 0.9) {
    payload = generateMediumPayload();
    payloadType = 'medium';
  } else {
    payload = generateLargePayload();
    payloadType = 'large';
  }
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Payload-Type': payloadType,
    },
    tags: {
      payload_type: payloadType,
    },
  };
  
  group('Execute Flow', () => {
    const startTime = Date.now();
    
    const response = http.post(
      `${BASE_URL}/api/v1/payments`,
      payload,
      params
    );
    
    const duration = Date.now() - startTime;
    requestDuration.add(duration);
    
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response has request_id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.request_id !== undefined;
        } catch (e) {
          return false;
        }
      },
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    if (success) {
      successfulRequests.add(1);
      errorRate.add(0);
    } else {
      errorRate.add(1);
      console.error(`Request failed: ${response.status}, body: ${response.body}`);
    }
  });
  
  // Small sleep to simulate think time
  sleep(Math.random() * 0.1);
}

// ==========================================
// Setup and Teardown
// ==========================================

export function setup() {
  console.log('🚀 Load test starting...');
  console.log(`Target URL: ${BASE_URL}`);
  
  // Deploy test flow
  const flowConfig = {
    id: 'load-test-flow',
    name: 'Load Test Flow',
    execution_mode: 'sync',
    nodes: [
      {
        id: 'extract-1',
        node_type: 'extract',
        data: { fields: ['userId', 'amount', 'currency'] },
      },
      {
        id: 'proxy-1',
        node_type: 'proxy',
        data: {
          target_url: 'https://httpbin.org/post',
          method: 'POST',
          timeout_ms: 5000,
        },
      },
      {
        id: 'eventlog-1',
        node_type: 'eventLog',
        data: { event_type: 'API_CALL' },
      },
      {
        id: 'audit-1',
        node_type: 'audit',
        data: { action: 'PROXY_CALL', entity_type: 'PAYMENT' },
      },
      {
        id: 'response-1',
        node_type: 'response',
        data: {
          status_code: 200,
          body_template: { success: true, request_id: '${request_id}' },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'extract-1', target: 'proxy-1' },
      { id: 'e2', source: 'proxy-1', target: 'eventlog-1' },
      { id: 'e3', source: 'eventlog-1', target: 'audit-1' },
      { id: 'e4', source: 'audit-1', target: 'response-1' },
    ],
    is_active: true,
  };
  
  const deployResponse = http.post(
    `${BASE_URL}/deploy/flows/load-test-flow`,
    JSON.stringify(flowConfig),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (deployResponse.status === 200) {
    console.log('✅ Test flow deployed');
  } else {
    console.warn('⚠️  Failed to deploy test flow:', deployResponse.body);
  }
  
  return { flowId: 'load-test-flow' };
}

export function teardown(data) {
  console.log('🧹 Cleaning up...');
  
  // Undeploy test flow
  const response = http.del(`${BASE_URL}/deploy/flows/${data.flowId}`);
  
  if (response.status === 200) {
    console.log('✅ Test flow undeployed');
  }
  
  console.log('✅ Load test completed');
}
