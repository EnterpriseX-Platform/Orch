# Orch — Logging Architecture (Final Design)

> Status: **final design — pending implementation** · updated 2026-06-03
> Goal: replace the old, messy behavior (gateway writing audit/api/event mixed together, screens pointing at the wrong table, a hardcoded Service A) with a **config-driven, node-owned** architecture.

---

## 0. Principles

1. **100% config-driven** — adding a new project/module (Service A, Service B, …) = **set up config in the UI only, never touch code**. There is no per-project hardcode in the code at all.
2. **Node = mandatory write** — a flow with an `audit` node *must* write audit; an `eventLog` node *must* write an event (guaranteed delivery, nothing lost silently).
3. **Gateway = fallback** for the **proxy path** (requests without a flow/node) — fully config-driven, covering both the **config-present** and **no-config** cases.
4. **Three systems kept separate by purpose** — never mixed:

| System | What it is | Stored in | Screen |
|---|---|---|---|
| **audit_logs** | who–changed–what (compliance/evidence) | DB | `/orch/audit` |
| **event_logs** | business events (flow event / pattern) | DB | **`/orch/logs` (new build)** |
| **access_logs** (formerly `api_logs`) | every-call traffic, like nginx `access.log` | **file** (ops) | — (no UI) |

---

## A. audit_logs

- **Written by:**
  1. broker **audit node** — *mandatory*, delivered via **Kafka (durable)** → consumer → DB
  2. **gateway fallback** — for proxies (Service A, etc.) that don't run a node; writes `prisma.auditLog` directly, **config-driven**
- **Double-write guard (node + gateway):** the broker sets the response header `X-Orch-Audit: node` once the node has written → the gateway sees it and **skips**; plus a `transactionKey` dedup of 10s as a backstop.
- **Config used:** `MessageFormat`/`FieldMapping`/`AuditConfig` → `actionType`, `refType`, `clobPath`, `usernameSource`, `maskPaths`

## B. event_logs

- **Written by:**
  1. broker **eventLog node** — *mandatory*, via Kafka (durable)
  2. **gateway EventLogPattern** — for proxies; rules set on the project page → **Event Log Rules** (`event_log_patterns`)
- **Screen:** repurpose **`/orch/logs`** to read `event_logs` (once access_log moves to a file, this page is freed up perfectly).
- **API merge:** `/api/events` + `/api/event-logs` (duplicates) → keep only **`/api/event-logs`**.

## C. access_logs (formerly api_logs)

- broker writes a **JSON line to stdout** (fast, no DB/disk) → the cluster log collector picks it up — following the "HTTPS-style access log" idea.
- **Drop** POST `/api/logs` to web (the broker writes locally instead).
- **No UI** (ops greps it); if we want to view it in the UI later, we'll build a viewer that reads from the collector.
- the old `api_logs` table: keep it disabled (historical), then decide whether to drop it later.

---

## D. De-Service-A — wire up config that "already exists but isn't used" (new fields added = 0)

> Verified: all 3 spots already have the fields to support this; no new config needed = no duplication.

| Hardcode spot | Currently | Change to (existing config) | Field that already exists |
|---|---|---|---|
| `route.ts:500` (diff source) | fixed `'$.object.*.request'` | `resolved.clobPath` | `FieldMapping.clobPath` — the resolver already exposes it at `format-resolver.ts:102`, used the same way as `extractTransactionKey:274` |
| `route.ts:528` (entityType) | `\|\| 'SERVICE-A'` | `resolved.refType ?? (format.system && \`${format.system}_ACTION\`) ?? format.code ?? api.name` | `MessageFormat.refType / system / code`, `ApiRegistration.name` |
| `route.ts:268` (discriminator) | strips `/^\/service-a/` | strip from the base of `api.endpoint` | `ApiRegistration.endpoint` |

(+ small debt: `/api/reports/service-a` + the `SERVICE_A` dropdown — rename to generic; the comment in the file already admits it is a "generic aggregator despite the name".)

---

## E. Mandatory delivery — make "mandatory" actually true

- **Current problem:** node → fire-and-forget HTTP POST (5s timeout) = if web is down → audit/event is **silently lost** ❌ (not truly "mandatory").
- **Change to:** node → **Kafka topic** (`audit-events` / `event-logs` — the publisher already exists) → **consumer** → `/api/audit` \| `/api/event-logs` → DB.
- Use the `WorkerManager` + `KafkaProducer` the broker **already has** (`main.rs:38-56`) — what's missing is the **consumer** (right now there's a publisher but no consumer → data gets dropped).
- gateway fallback: keep writing `prisma` directly (it runs in the web process, which already has DB access).

---

## F. Cleanup / consolidation

- Pick **a single SDK executor** — stop using the legacy `services/flow_executor.rs` audit/event node, which duplicates the work via a different mechanism (Kafka vs HTTP).
- Merge `/api/events` + `/api/event-logs`.
- **(separate debt, do later)** schema dedup:
  - drop DEPRECATED: `MessageFormat.sourcePage/sourceFunction/sourceButton/sourceSystem`
  - reconcile `MessageFormat.auditFields` ⟷ `AuditConfig.auditFields`/`extractFields` (audit fields stored in 2–3 places)
  - reconcile `MessageFormat.fieldMappings`(Json) ⟷ `MessageFormat.fieldMapping`(FK lib) — the names clash

---

## Work order (low → high risk)

| # | Task | Impact | Notes |
|---|---|---|---|
| **0** | **deploy `v1.1601`** (gateway audit fix) | — | stop the Service A audit bleeding so QA can test (image is ready) |
| 1 | **event_logs viewer** (repurpose `/orch/logs`) | additive | unblocks "can't view events" |
| 2 | **de-Service-A gateway** (§D) | small | wire `clobPath`/`refType`/`endpoint` |
| 3 | **double-write guard** (§A) | medium | node header → gateway skip |
| 4 | **access_log → file** (§C) | medium | broker stdout, drop POST `/api/logs` |
| 5 | **mandatory delivery** (§E) | large | Kafka consumer |
| 6 | **consolidate** (§F) | large | single executor + merge APIs |
| 7 | schema dedup (§F debt) | later | migration |

---

## Answer to "does a new project need code?"

**No** — register the API + set up MessageFormat/FieldMapping/AuditConfig/EventLogPattern (+ a flow if you need logic) in the UI = done.
Section §D is the only debt blocking this (the 3 hardcoded Service A spots) — once fixed, "add a module = 0 lines of code" becomes true.
