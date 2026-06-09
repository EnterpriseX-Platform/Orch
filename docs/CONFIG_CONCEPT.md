# Orch — Configuration Concept Guide

> **Goal:** understand the mental model of configuring Orch before you start doing it for real.
> **Audience:** teams about to configure a new system / extend Service A.

---

## 🎯 TL;DR (5 lines)

```
1. Project         = one system (e.g. Service A)
2. ApiRegistration = one URL endpoint (e.g. /microflow/service)
3. MessageFormat   = one action context (screen + tab + button + actionType)
4. Flow            = policy template (audit / rate-limit / sign-off rules)
5. Gateway         = Apache → Orch → Broker → Backend ← audit captured here
```

**Relationships:**
```
Project (1) ─── has many ──→ ApiRegistration (N)
    │                              │
    │                              │ has many
    │                              ▼
    │                       MessageFormat (N)
    │                              │
    │                              │ uses (optional)
    │                              ▼
    └─ has many ────────────→ Flow (1..N)
```

---

## 📚 Table of Contents

1. [Mental Model](#mental-model)
2. [3-Level Config Hierarchy](#3-level-config-hierarchy)
3. [Decision Flow — when to create what](#decision-flow)
4. [Action Context — Information fields](#action-context)
5. [Discriminator Routing — 1 URL → N Formats](#discriminator-routing)
6. [Policy Templates — Flow Integration](#policy-templates)
7. [Audit Chain — how data flows](#audit-chain)
8. [Common Patterns](#common-patterns)
9. [How to Config a New System](#how-to-config-a-new-system)

---

## Mental Model

### 🏗️ **Think of it like a "Restaurant Menu"**

| Restaurant | Orch |
|---|---|
| The restaurant | **Project** |
| A menu item | **ApiRegistration** (URL) |
| Plating + description | **MessageFormat** (Information) |
| The chef / recipe | **Flow** (policy template) |

**Example:**
- Restaurant = Service A
- Menu item = "/service-a/microflow/service" (one URL handles everything)
- Plating:
  - "Confirm Sign-Off on the Orders screen" (a specific description)
  - "Confirm Sign-Off on the Vendors screen" (a different context)
- Chef = Flow audit + sign-off policy

> **Key insight:** the URL says "what" → the Information says "where/how it's used"

---

## 3-Level Config Hierarchy

### Level 1: **Project** (the system)

```
Service A Project
├── slug: "service-a"
├── baseUrl: https://sit.orch.example.com
├── authType: NONE (or JWT/API_KEY/OAUTH2)
└── openApiSpec: {...}
```

**When to create:** one per system you onboard (Service A, Service B, ...).

### Level 2: **ApiRegistration** (URL)

```
service-a-microflow
├── endpoint: /service-a/microflow/service
├── method: POST
├── apiType: MICROFLOW
├── routeType: SHARED_ENDPOINT      ← key!
├── routingKey: $.flowName          ← discriminator field
├── backendUrl: http://service-a-svc.service-center.svc.cluster.local:8080/...
├── rateLimitPerMin: 60
├── quotaPerDay: 10000
├── timeout: 60
├── retries: 0
└── flowId: MICROFLOW_flow_id       ← default policy
```

**The 2 routeType variants:**
| Type | Use when | Example |
|---|---|---|
| `DEDICATED` | 1 URL → 1 action | `/api/orders/title/insert` |
| `SHARED_ENDPOINT` | 1 URL → many actions | `/microflow/service` (body.flowName differentiates) |

### Level 3: **MessageFormat** (Information)

```
SIGNOFF-ORDER
├── code: "SIGNOFF-ORDER"                    ← stable business ID
├── apiRegistrationId: service-a-microflow
├── discriminatorValue: "saveSampleAction"
├── actionType: SIGNOFF                       ← policy hint
├── actionLabel: "Confirm (Sign-Off)"         ← user-visible
├── system: "SERVICE_A"
├── screenCode: "SERVICE-A"
├── screenName: "Order Review"
├── tabName: "Summary"
├── pkXPath: "$.object.input.ID"              ← entity ID
├── refIdPath: "$.object.input.REF_ID"
├── userIdPath: "$.ref_user_id"
└── auditEnabled: true
```

**Multiple Formats per 1 API = use a discriminator to split them**

---

## Decision Flow

```
┌─────────────────────────────────────────────────┐
│ Is there a new URL to config?                   │
└─────────────────────────┬───────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │ Does this URL    │
                │ already exist?   │
                └─────┬────────────┘
                      │
            NO ───────┴───────── YES
            ▼                     ▼
    ┌──────────────┐     ┌───────────────────┐
    │ Create an    │     │ Does the URL take │
    │ API          │     │ many flows?       │
    │ Registration │     └──┬────────────────┘
    │ (Level 2)    │        │
    └──────┬───────┘        │
           │         NO ────┴──── YES
           │         ▼             ▼
           │    ┌───────┐    ┌──────────────────┐
           │    │ 1:1   │    │ 1 API → N Formats│
           │    │ format│    │ (SHARED_ENDPOINT)│
           │    └───────┘    └──────┬───────────┘
           │                        │
           ▼                        ▼
    ┌──────────────────────────────────┐
    │ Create a MessageFormat (Level 3) │
    │ one per action context           │
    │ (screen + tab + button)          │
    └──────────────────────────────────┘
```

### Rule of Thumb

- **One URL / one flow / one screen** → DEDICATED + 1 MessageFormat
- **One URL / many flows / many screens** → SHARED_ENDPOINT + N MessageFormats
- **Same flow / many screens** → N MessageFormats (different `screenCode`) — ⚠️ needs a 2nd-level discriminator

---

## Action Context

### 🎯 Information Fields — what matters and what doesn't

```
┌──────── REQUIRED (must-have) ─────────────────────────────┐
│  code              → stable business ID (grep-able)        │
│  name              → display in UI list                    │
│  apiRegistrationId → parent API                            │
│  actionType        → READ/WRITE/SUBMIT/SIGNOFF/EXPORT/...  │
│  discriminatorSource + field + value → routing             │
└────────────────────────────────────────────────────────────┘

┌──────── IMPORTANT (should have) ──────────────────────────┐
│  actionLabel       → button text (audit readability)       │
│  screenCode        → stable screen ID                      │
│  screenName        → human-readable screen name            │
│  system            → "SERVICE_A" (filter by system)        │
│  auditEnabled      → true (default)                        │
└────────────────────────────────────────────────────────────┘

┌──────── NICE-TO-HAVE (optional) ──────────────────────────┐
│  tabName           → only for screens that have tabs        │
│  description       → long-form business context            │
│  pkXPath           → entity ID extraction                  │
│  refIdPath         → reference ID extraction               │
│  userIdPath        → user ID from payload                  │
│  techHints         → debug metadata (fn, btnId)            │
└────────────────────────────────────────────────────────────┘
```

### 🎨 ActionType Catalog

| Type | Color | Purpose | Examples |
|---|:-:|---|---|
| `SIGNOFF` | 🔴🔴 | Digital sign-off (**highest priority**, immutable) | Final order approval |
| `SUBMIT` | 🟠 | Submit for approval | Submit review result |
| `APPROVE` | 🟠 | Approver action | Approve request |
| `REJECT` | 🟠 | Reject submission | Reject request |
| `DELETE` | 🔴 | Remove (destructive) | Delete record |
| `CREATE` | 🟢 | Insert new | Add line item |
| `UPDATE` | 🔵 | Edit / save | Save edits |
| `CLONE` | 🟦 | Copy / duplicate | Duplicate record |
| `EXPORT` | 🟣 | Generate report | Export PDF/Excel |
| `DOWNLOAD` | 🟣 | File retrieval | Download file |
| `READ` | ⚪ | View / load | Load screen |
| `SEARCH` | ⚪ | Filter / query | Search |
| `COMMENT` | 💬 | Comment CRUD | Add/edit/delete comment |

### 💡 **ActionType = Policy Hint**

Orch uses actionType to:
- Choose the **audit severity** (SIGNOFF stores the full payload / READ stores only metadata)
- Set the **retention policy** (SIGNOFF = forever / READ = 30 days)
- Decide **idempotency** (WRITE actions require an idempotency-key)
- Show the **color code** in the Reports UI

---

## Discriminator Routing

### Case 1: Simple — 1 URL = 1 Action (no discriminator needed)

```
POST /api/orders/title/insert
  └── MessageFormat: ORDER-TITLE-CREATE
      ├── discriminatorSource: NONE
      └── actionType: CREATE
```

### Case 2: SHARED_ENDPOINT — 1 URL + body discriminator

```
POST /microflow/service
  Body: {"flowName": "XXX", ...}

  ├── discriminatorSource: BODY
  ├── discriminatorField: $.flowName
  └── MessageFormats (80):
      ├── value="loadOrder"          → actionType=READ
      ├── value="saveSampleAction"   → actionType=SUBMIT
      ├── value="saveSampleAction"   → actionType=SIGNOFF ⭐
      └── ...
```

### Case 3: Same flowName from multiple screens (⚠️ advanced)

```
POST /microflow/service  {"flowName":"saveSampleAction"}
  │
  ├── called from screen SC05-T1 → should match SIGNOFF-ORDER
  └── called from screen SC08-T1 → should match SIGNOFF-VENDOR

Current: gateway picks the 1st match only → WRONG
Solution: add a 2nd-level discriminator
```

**Options for a 2nd discriminator:**

| Method | Pros | Cons |
|---|---|---|
| HTTP header `X-Screen-Code` | Clean, explicit | Requires a frontend change |
| `Referer` URL parsing | No frontend change | Fragile (URL may differ) |
| Body field `$.screenContext` | Structured | Requires schema |

### Example — 2nd-level discriminator setup

```javascript
// MessageFormat definition
{
  "code": "SIGNOFF-ORDER",
  "discriminatorSource": "BODY",
  "discriminatorField": "$.flowName",
  "discriminatorValue": "saveSampleAction",
  "screenCode": "SERVICE-A"   // secondary match
}

// Gateway logic
const primaryMatch = formats.filter(f => body.flowName === f.discriminatorValue);
if (primaryMatch.length > 1) {
  const screenHint = request.headers.get('x-screen-code');
  return primaryMatch.find(f => f.screenCode === screenHint) || primaryMatch[0];
}
```

---

## Policy Templates

### 🔄 **Flow = reusable policy**

**Idea:** instead of configuring policy per-format (107 times), create a "template" you can reuse.

```
┌────────────────────────────┐
│  Flow: SIGNOFF_POLICY      │
├────────────────────────────┤
│  1. Audit (full payload)   │
│  2. Idempotency required   │
│  3. Alert webhook          │
│  4. Forward to backend     │
│  5. Log to Kafka           │
└────────────────────────────┘
       ↑
       │ (all SIGNOFF MessageFormats use this flow)
       │
  [SIGNOFF-ORDER]  [SIGNOFF-VENDOR]
```

### 📋 Recommended Flow Templates

```
Flow_SIGNOFF  (criticality: 🔴🔴)
  ├── Audit: full payload + alert
  ├── Idempotency: REQUIRED (reject duplicate)
  ├── Retry: 0
  └── Webhook: Slack/email alert

Flow_SUBMIT   (criticality: 🔴)
  ├── Audit: full payload
  ├── Idempotency: recommended
  └── Retry: 1

Flow_WRITE    (criticality: 🟡)
  ├── Audit: medium detail
  └── Retry: 1

Flow_READ     (criticality: 🟢)
  ├── Audit: metadata only
  ├── Cache: 60s
  └── Retry: 2

Flow_EXPORT   (criticality: 🟡)
  ├── Audit: track downloads
  ├── Rate limit: strict
  └── Timeout: 120s (heavy generation)
```

### 🎯 Config Pattern

```sql
-- Link MessageFormats to the appropriate Flow
UPDATE message_formats mf
SET flow_id = (
  CASE mf.action_type
    WHEN 'signoff'  THEN (SELECT id FROM flows WHERE name='Flow_SIGNOFF')
    WHEN 'submit'   THEN (SELECT id FROM flows WHERE name='Flow_SUBMIT')
    WHEN 'update'   THEN (SELECT id FROM flows WHERE name='Flow_WRITE')
    WHEN 'create'   THEN (SELECT id FROM flows WHERE name='Flow_WRITE')
    WHEN 'delete'   THEN (SELECT id FROM flows WHERE name='Flow_WRITE')
    WHEN 'export'   THEN (SELECT id FROM flows WHERE name='Flow_EXPORT')
    WHEN 'download' THEN (SELECT id FROM flows WHERE name='Flow_EXPORT')
    ELSE                 (SELECT id FROM flows WHERE name='Flow_READ')
  END
);
```

---

## Audit Chain

### 🔄 How data flows from Client → Audit Log

```
1. Client: POST /service-a/microflow/service
           Body: {"flowName":"saveSampleAction", "object":{"input":{...}}}
                                 │
                                 ▼
2. Apache proxy: forward to the Orch gateway
                                 │
                                 ▼
3. Gateway (Next.js /api/v1/[[...path]]):
   a. Match ApiRegistration by URL pattern → service-a-microflow
   b. Resolve MessageFormat by discriminator:
      - Read body.flowName = "saveSampleAction"
      - Match MessageFormat: SIGNOFF-ORDER
   c. Forward to broker → wait for response
   d. FIRE-AND-FORGET: write audit_log
                                 │
                                 ▼
4. Broker: execute flow (audit node, http proxy)
                                 │
                                 ▼
5. Service A backend: 200 OK
                                 │
                                 ▼
6. Gateway: return response to client
                                 │
                                 ▼
7. audit_logs table:
   {
     action: "API_CALL",               ← broker enum
     entity_type: "SERVICE-A",
     entity_id: "SIGNOFF-ORDER",       ← format.code
     user_id: <resolved from header or admin fallback>,
     user_ip: "10.1.x.x",
     changes: {
       actionType: "SIGNOFF",          ← from MessageFormat
       actionLabel: "Confirm (Sign-Off)",
       screenCode: "SERVICE-A",
       screenName: "Order Review",
       tabName: "Summary",
       system: "SERVICE_A",
       path: "/service-a/service-a/microflow/service",
       method: "POST",
       statusCode: 200,
       durationMs: 345,
       requestId: "...",
     },
     newValues: {<full request body>},
     timestamp: "2026-04-22T09:15:00Z",
   }
```

### 📊 Reports Query Audit

```sql
-- Daily SIGNOFF report
SELECT 
  timestamp,
  changes->>'actionLabel' as action,
  changes->>'screenName' as screen,
  user_ip,
  user_id
FROM audit_logs
WHERE entity_type='SERVICE-A'
  AND changes->>'actionType'='SIGNOFF'
  AND timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

Or via the Reports UI: `/orch/reports?type=daily`

---

## Common Patterns

### Pattern 1: **CRUD API** (simple, DEDICATED)

**Scenario:** a REST endpoint with a fixed URL per action

```
POST /api/orders/title/insert    → 1 MF: action=CREATE
POST /api/orders/title/update/{id}→ 1 MF: action=UPDATE
POST /api/orders/title/delete/{id}→ 1 MF: action=DELETE
GET  /api/orders/title/{id}      → 1 MF: action=READ
```

**Config:**
- 1 ApiRegistration per URL (routeType=DEDICATED)
- 1 MessageFormat per URL (discriminatorSource=NONE)
- A different Flow per action type

### Pattern 2: **Microflow Gateway** (SHARED_ENDPOINT)

**Scenario:** 1 URL handles N business operations via a body discriminator

```
POST /microflow/service
  Body: {"flowName": "XXX"}
```

**Config:**
- 1 ApiRegistration (routeType=SHARED_ENDPOINT, routingKey=$.flowName)
- N MessageFormats (1 per flowName, different action types)

### Pattern 3: **Report Export**

**Scenario:** a generic endpoint that generates different reports

```
POST /component/v1/api/export/data
  Body: {"elements":[{"id": "REPORT_CODE_PDF"}]}
```

**Config:**
- 1 ApiRegistration (routeType=SHARED_ENDPOINT, routingKey=$.elements[0].id)
- N MessageFormats (1 per report ID)
- All use Flow_EXPORT

### Pattern 4: **Multi-screen shared flow**

**Scenario:** the same flowName is called from multiple screens

```
saveSampleAction called from SC05-T1 AND SC08-T1
```

**Config:**
- Option A: 1 MessageFormat (lose screen granularity)
- Option B: N MessageFormats + a 2nd-level discriminator (header/referer) ⭐

---

## How to Config a New System

### 🎯 Step-by-step Playbook

#### Step 1: **Inventory** (do this first!)

```
1. List all screens in the system (menu/routes)
2. For each screen, list:
   - Tabs (if any)
   - Action buttons (save/submit/signoff/export/delete)
   - The API URL each button calls
3. Identify:
   - Unique URLs → ApiRegistration candidates
   - Unique actions per URL → MessageFormat candidates
```

**Tools:** parse the frontend code (HTML + JS scan) → Excel inventory

#### Step 2: **Design**

```
1. For each unique URL → decide the routeType
   - 1 URL = 1 action → DEDICATED
   - 1 URL = N actions → SHARED_ENDPOINT + routingKey

2. For each action → assign an actionType
3. Group actions by policy → define Flow templates
   - SIGNOFF, SUBMIT, WRITE, READ, EXPORT
```

#### Step 3: **Prepare Data**

```json
// apis.json
{
  "apis": [
    {
      "name": "my-system-microflow",
      "endpoint": "/my-system/microflow/service",
      "method": "POST",
      "backendUrl": "http://my-system-svc.ns.svc.cluster.local:8080/...",
      "routeType": "SHARED_ENDPOINT",
      "routingKey": "$.flowName",
      "rateLimitPerMin": 60,
      "projectName": "My System"
    }
  ]
}

// formats.json
{
  "formats": [
    {
      "code": "MY-SIGNOFF-ORDER",
      "apiRegistrationName": "my-system-microflow",
      "discriminatorSource": "BODY",
      "discriminatorField": "$.flowName",
      "discriminatorValue": "saveOrderSIGNOFF",
      "actionType": "SIGNOFF",
      "actionLabel": "Confirm Order Sign-Off",
      "system": "MY_SYSTEM",
      "screenCode": "MY-01-SC01",
      "screenName": "Order screen",
      "userIdPath": "$.user_id"
    }
  ]
}
```

#### Step 4: **Bulk Import**

```bash
TOKEN=$(curl ... | jq -r .accessToken)

# 1. Import APIs
curl -X POST "/orch/api/registers/bulk" -H "Authorization: Bearer $TOKEN" -d @apis.json

# 2. Import MessageFormats (references APIs by name)
curl -X POST "/orch/api/message/formats/bulk" -H "Authorization: Bearer $TOKEN" -d @formats.json
```

#### Step 5: **Setup Flow (policy)**

```
1. Create a Flow via the UI (/orch/flows/new)
   - Name: Flow_SIGNOFF
   - Nodes: Audit → HTTP Proxy → (Alert webhook)
2. Deploy the Flow to the broker:
   POST /orch/api/flows/{id}/deploy
3. Link MessageFormats to the Flow:
   UPDATE message_formats SET flow_id=... WHERE action_type='SIGNOFF'
```

#### Step 6: **Reverse-proxy cutover**

Point your reverse proxy / API gateway at Orch so the new system's paths flow
through the broker:

```
# Route the new system's API + microflow paths through Orch's gateway:
/my-system/api        → http://orch:3047/orch/api/v1/my-system/api
/my-system/microflow  → http://orch:3047/orch/api/v1/my-system/microflow
/my-system            → http://my-system-svc:8080/my-system   (SPA, direct)
```

Then reload the proxy.

#### Step 7: **Verify**

```bash
# Test API routing
curl -X POST "https://sit.orch.example.com/my-system/microflow/service" \
  -H 'Content-Type: application/json' \
  -d '{"flowName":"saveOrderSIGNOFF", ...}'

# Check the audit log persisted
psql -c "SELECT * FROM audit_logs WHERE entity_id='MY-SIGNOFF-ORDER' ORDER BY timestamp DESC LIMIT 5"

# Check the Reports UI
open https://sit.orch.example.com/orch/reports
```

---

## 💡 Best Practices

### ✅ Do

1. **Stable `code` field** — use a business-meaningful ID (e.g., `SIGNOFF-ORDER` not `fmt_abc123`)
2. **Human-readable `actionLabel`** — so the audit log is readable by a domain expert
3. **Fill `userIdPath`** — so the audit has the real user (not a fallback to admin)
4. **Use Flow templates** — reuse 5 flows for 100+ formats (not 1-per-format)
5. **Dry-run the bulk import first** — `{"dryRun":true,...}` to preview changes
6. **Version-control the import JSON** — commit to `/infra/config/` in git
7. **Test with real traffic before cutover** — shadow mode

### ❌ Don't

1. Don't create 1 Flow per MessageFormat (over-engineered)
2. Don't rely on `fn_id` UUIDs for business logic (they change)
3. Don't skip `discriminatorField`/`Value` (breaks routing)
4. Don't commit credentials to `apis.json`
5. Don't cut over Apache on a Friday afternoon 😅

---

## 🧩 Glossary

| Term | Meaning |
|---|---|
| **Project** | one business system (e.g. Service A) |
| **ApiRegistration** | one URL endpoint config |
| **MessageFormat** | one action context (screen+tab+button) |
| **Flow** | policy template (audit/idempotency/webhook) |
| **Discriminator** | the field that differentiates N formats sharing 1 URL |
| **routeType** | DEDICATED (1:1) or SHARED_ENDPOINT (1:N) |
| **routingKey** | JSONPath for the discriminator (e.g., `$.flowName`) |
| **actionType** | Enum: READ/WRITE/SIGNOFF/EXPORT/... |
| **cutover** | switch traffic from the direct backend → via the Orch gateway |

---

## 📚 Related Docs

- **`docker-compose.yml`** — run the full stack locally
- **`apps/web/prisma/schema.prisma`** — schema reference
- **`apps/web/app/api/v1/[[...path]]/route.ts`** — gateway implementation

---

*Questions? Update this doc via a PR to `docs/CONFIG_CONCEPT.md`*
