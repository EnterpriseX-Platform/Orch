# Async Response Guide

The platform supports three ways to deliver results back to the client in an async flow:

## 1. Webhook Callback

### Flow Node: `Webhook Callback`

**How it works:**
- The consumer flow sends an HTTP POST to a configured URL
- You can use a dynamic URL taken from the request, or a fixed constant

**Client Integration:**
```javascript
// Request from the client
POST /api/v1/payments
{
  "amount": 1000,
  "callbackUrl": "https://client.com/webhooks/payment-result"
}

// Immediate response
{
  "requestId": "req_abc123",
  "status": "accepted",
  "message": "Processing in background"
}

// Webhook delivered when processing completes
POST https://client.com/webhooks/payment-result
{
  "requestId": "req_abc123",
  "status": "completed",
  "result": {
    "transactionId": "txn_123",
    "status": "success"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Retry Policy:**
- No Retry: send once
- 3 attempts: retry up to 3 times
- 5 attempts: retry up to 5 times
- Exponential backoff: wait 1s, 2s, 4s, 8s...

---

## 2. WebSocket Push

### Flow Node: `WebSocket Push`

**How it works:**
- The client connects a WebSocket before or after sending the request
- The gateway pushes the result over that same WebSocket connection

**Client Integration:**
```javascript
// 1. Connect WebSocket
const requestId = 'req_abc123' // obtained from the first response
const ws = new WebSocket(`wss://gateway/ws/${requestId}`)

// 2. Send the async request
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'start',
    payload: {
      endpoint: '/api/v1/payments',
      data: { amount: 1000 }
    }
  }))
}

// 3. Wait for the result
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  
  if (message.type === 'accepted') {
    console.log('Request accepted:', message.requestId)
  }
  
  if (message.type === 'completed') {
    console.log('Result:', message.result)
    ws.close()
  }
  
  if (message.type === 'error') {
    console.error('Error:', message.error)
    ws.close()
  }
}
```

**Event Types:**
- `accepted` - request accepted by the platform
- `processing` - processing in progress
- `completed` - succeeded (includes result)
- `error` - an error occurred

---

## 3. Polling API

### Endpoint: `GET /api/status/{requestId}`

**How it works:**
- The client receives a `requestId` in the immediate response
- The client polls periodically to check status
- Results are retained for 30 minutes (TTL)

**Client Integration:**
```javascript
// 1. Send the async request
const response = await fetch('/api/v1/payments', {
  method: 'POST',
  body: JSON.stringify({ amount: 1000 })
})
const { requestId } = await response.json()

// 2. Poll for status
const pollStatus = async () => {
  const statusRes = await fetch(`/api/status/${requestId}`)
  const status = await statusRes.json()
  
  if (status.status === 'completed') {
    console.log('Result:', status.result)
    return status.result
  }
  
  if (status.status === 'failed') {
    throw new Error(status.error)
  }
  
  // Not done yet, wait 2 seconds then retry
  await new Promise(r => setTimeout(r, 2000))
  return pollStatus()
}

const result = await pollStatus()
```

**Response Format:**
```json
{
  "requestId": "req_abc123",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:30:05Z",
  "duration": 5000,
  "result": { ... },
  "expiresAt": "2024-01-15T11:00:00Z"
}
```

**Status Values:**
- `pending` - waiting to start processing
- `running` - processing in progress
- `completed` - succeeded (includes result)
- `failed` - failed (includes error)
- `not_found` - request not found (expired)

---

## Choosing an Approach

| Method | When to use | Pros | Cons |
|------|------------|-------|---------|
| **Webhook** | Microservices, external APIs | Real-time, no waiting | Requires a public URL |
| **WebSocket** | Real-time apps, dashboards | Very fast, bi-directional | More complex, must maintain a connection |
| **Polling** | Mobile, legacy, simple clients | Easy, works anywhere | Adds delay, consumes resources |

## Combining Approaches

You can use several approaches at once:

```
[HTTP Request] → [Process] → [Push to Kafka] → [HTTP Response: 202]
                                    ↓
                           [Consumer Flow]
                                    ↓
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
              [Webhook]      [WebSocket]      [Update Status]
                    ↓               ↓               ↓
                Client          Client         Polling API
```

**Example Flow:**
```
Async API Flow with Multi-Channel Response:

[HTTP Request] 
    ↓
[App Event Log]
    ↓
[Push to Kafka] → responds with: { requestId, status: "accepted" }
    ↓
[HTTP Response: 202]

# Consumer flow running alongside:
[Kafka Consumer]
    ↓
[App Event Log]
    ↓
[Audit Trail]
    ↓
[Call Service]
    ↓
[Transform]
    ↓
┌──────────┬──────────┬──────────┐
↓          ↓          ↓          ↓
[Webhook] [WebSocket] [Status]  [End]
```
