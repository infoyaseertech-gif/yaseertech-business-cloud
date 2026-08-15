# YaseeTech Business Cloud — Phase 1 Deliverables
### System Architecture & Tech Stack Finalization

**Depends on:** Phase 0 sign-off (tenant model = shared DB + RLS, concurrency target = ~15,000 concurrent sessions, data residency question resolved before infra region is picked).

**Status:** Draft for engineering + stakeholder sign-off.

---

## 1. High-Level Architecture

See the diagram above. Flow: **client apps → API gateway/load balancer → stateless app servers → PostgreSQL / Redis / message queue → background workers → third-party integrations.**

Notes that don't fit in the diagram itself:

- **Client apps** are the Next.js web dashboard and the Flutter POS app. Both talk to the same API — there is no separate "mobile API."
- **API gateway** is also where rate limiting (per-tenant, per-user) is enforced at the edge, before a request burns app-server capacity — this is the first line of defense for the "runaway tenant" risk flagged in Phase 0's risk register.
- **App servers are stateless by design** — no session state, no in-memory cache, nothing that would break if a request from the same user hits a different instance on the next call. This is what makes horizontal scaling (Section 5) possible without sticky sessions.
- **PostgreSQL, Redis, and the message queue are peers**, not a pipeline — app servers write to Postgres for durable state, read/write Redis for cache and rate-limit counters, and push jobs onto the queue. They don't depend on each other.
- **Background workers** are a separate deployable from the app servers (different scaling profile — job processing scales with queue depth, not with HTTP request volume) and are the only thing that calls Flutterwave, the SMS gateway, and the email provider directly. App servers never call third parties synchronously inside a request — a slow SMS provider should never make a POS checkout hang.

---

## 2. Multi-Tenancy Implementation Spec

This section makes Phase 0's tenant-model decision concrete and binding.

### 2.1 Schema rule
Every table holding business data carries a non-nullable `tenant_id UUID`. No exceptions — if a table is tempted to omit it because "it's global," that's a signal it belongs in a separate platform-level schema (e.g. `plans`, `feature_flags`), not that the rule bends.

### 2.2 Row-Level Security (defense in depth)
```sql
-- Example: applied to every tenant-scoped table
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON sales_transactions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```
- `app.current_tenant_id` is set **once per request/transaction** by the app server, immediately after authenticating the caller — never derived from anything the client sends directly.
- RLS is not a substitute for application-layer `WHERE tenant_id = ?` filtering — both layers apply. RLS exists so that a bug, a forgotten `WHERE` clause, or a raw admin query still can't leak cross-tenant rows.
- The database user the app connects as must **not** have `BYPASSRLS`. A separate, tightly-controlled superuser role (used only for migrations and the audited "view as tenant" support tool from Phase 0/11) is the sole exception, and every use of it is logged.

### 2.3 Tenant context resolution
```
Request → JWT verified → tenant_id extracted from token claims
        → middleware sets app.current_tenant_id for this DB transaction
        → all subsequent queries in this request are scoped, automatically
```
- The `tenant_id` in the JWT is set at login time from the authenticated user's own tenant membership — a user token is minted for exactly one tenant context.
- If a request tries to pass a `tenant_id` in the URL, query string, or body, the server **ignores it** for authorization purposes; it's only ever taken from the verified token. Any endpoint that appears to need a client-supplied tenant_id is treated as a design smell and re-reviewed (a support "view as tenant" flow is the one legitimate exception, and it uses a separate, audited elevation path — not a regular request parameter).

### 2.4 Cross-tenant operations (the few that legitimately exist)
- **Platform Super Admin** actions (billing overrides, "view as tenant") go through a distinct, audit-logged code path with its own role check — never the regular per-tenant RLS context.
- **Reporting/analytics that spans tenants** (e.g. YaseeTech's own product usage analytics from Phase 11) reads from a separate aggregated/anonymized data store, never queries tenant tables directly across tenants.

---

## 3. API Design Standard

- **Style:** REST. GraphQL was considered but rejected for v1 — the module boundaries (POS, inventory, accounting, CRM) map cleanly to REST resources, and REST keeps caching, rate limiting, and the offline-sync design (Section 6) simpler to reason about. Revisit only if a specific module genuinely needs GraphQL's flexibility later.
- **Versioning from day one:** `/api/v1/...`. Breaking changes ship as `/api/v2/...` behind a deprecation window — never a breaking change to `v1` in place.
- **Consistent error shape** across every endpoint:
```json
{
  "error": {
    "code": "INVENTORY_INSUFFICIENT_STOCK",
    "message": "Not enough stock to complete this sale.",
    "details": { "product_id": "...", "requested": 5, "available": 2 }
  }
}
```
  Machine-readable `code` first, human-readable `message` second, structured `details` for anything the client UI needs to react to programmatically.
- **Pagination on every list endpoint, no exceptions.** Cursor-based (not offset) for high-volume tables like `sales_transactions` and `audit_logs`, since offset pagination degrades badly at scale and skips/duplicates rows under concurrent writes.
- **Idempotency keys** required on every write endpoint that could plausibly be retried by a flaky connection (POS sale creation, payment webhook processing, invoice creation) — client or caller supplies an `Idempotency-Key` header; the server deduplicates.

---

## 4. Authentication & Authorization Architecture

### 4.1 Tokens
- **Access token:** JWT, ~15 minute expiry, contains `user_id`, `tenant_id`, `role`. Short-lived so a leaked token has a small blast radius.
- **Refresh token:** long-lived, **rotated on every use** (old one invalidated the moment a new one is issued — detects token theft, since a stolen-then-reused old refresh token signals compromise and can trigger a forced logout of that session chain), stored **hashed** in the database, never in plaintext.
- Both tokens are tied to a specific tenant context at issuance — a token minted while logged into Business A cannot be replayed against Business B's endpoints, because `tenant_id` is baked into the token, not supplied by the client.

### 4.2 RBAC — permissions matrix (documented before coding starts)

**Platform-level roles** (not scoped to any tenant):
| Role | Scope |
|---|---|
| Super Admin | Full platform access, billing overrides, audited "view as tenant" |
| Support Agent | Read-only "view as tenant" (time-boxed, audit-logged), subscription state adjustments |

**Tenant-level roles** (scoped to one `tenant_id`):
| Role | POS | Inventory | CRM | Accounting | Invoicing | Multi-branch | User mgmt |
|---|---|---|---|---|---|---|---|
| Business Owner | Full | Full | Full | Full | Full | All branches | Full |
| Branch Manager | Full | Full (own branch) | Full | Read-only | Full | Own branch only | Own branch staff |
| Accountant | Read-only | Read-only | Read-only | Full | Full | All branches (read) | None |
| Cashier | Create sales only | Read stock levels | Create/view customers | None | None | Own branch only | None |
| Staff | Configurable per business | Configurable | Configurable | None | None | Own branch only | None |

This table is a starting point for stakeholder review, not final — the exact Staff-role permissions are deliberately left configurable since SME needs vary, but the other rows should be locked before Phase 3 coding begins.

### 4.3 Future-proofing
- Auth tables include nullable columns/related tables for **2FA** (TOTP secret, backup codes) and **SSO** (external identity provider ID, provider type) from Phase 2's schema design onward, even though neither ships in v1. Retrofitting these into a live user table later is far more disruptive than reserving the space now.

---

## 5. Horizontal Scalability Design

- **App servers are stateless** (Section 1) — any instance can serve any request. This is what makes "add more instances under load" actually work, rather than requiring sticky sessions that would fight the load balancer.
- **Sessions and cache live in Redis**, never in-memory on the app server. An app server restart or a new instance spinning up never loses session state.
- **Database connection pooling (PgBouncer)** sits between app servers and PostgreSQL — with potentially hundreds of app-server instances at peak, direct Postgres connections per instance would exhaust Postgres's connection limit long before compute is the bottleneck. This is flagged here in Phase 1 because it affects the connection architecture, and implemented as part of Phase 8's scalability work.
- **Read replicas** take reporting/analytics query load off the primary, keeping POS write latency low during peak hours (Phase 2, Section 5 of the DB design covers this in more detail).
- **Autoscaling** (Phase 8) is based on request-queue depth and CPU, not just CPU alone — request-queue depth catches saturation before CPU maxes out, giving more lead time to scale up before latency degrades.

---

## 6. Offline-First Sync Design (POS Clients)

This is a hard requirement, not best-effort, per Phase 0's Nigeria-first constraints.

### 6.1 Local storage
- SQLite on-device, mirroring the subset of server schema the POS app needs: products, stock levels (per branch), customers, and a local **write queue** of pending operations (sales, stock adjustments) not yet confirmed by the server.

### 6.2 Write flow
```
Cashier action (sale) → written to local SQLite immediately (instant UI feedback)
                       → queued for sync
                       → background sync attempts when connectivity available
                       → server confirms → local record marked synced
                       → server rejects (rare — e.g. duplicate) → flagged for review, never silently dropped
```

### 6.3 Conflict resolution — inventory specifically
Inventory is the highest-risk area for offline conflicts (two devices selling the last unit of the same product while both offline).

- **Strategy: last-write-wins at the field level, with a full audit trail — never a silent overwrite.**
- Every stock adjustment (from a sale or manual edit) is stored as a **movement record** (delta), not just a final quantity overwrite. This means two offline devices both recording "-1 unit" don't conflict with each other at all — deltas compose. It's only the *resulting stock level going negative* that's a genuine conflict.
- If a sync would push stock below zero: the sale itself is **not rejected** (the sale already happened physically — rejecting it after the fact would contradict reality and lose revenue tracking), but the resulting negative stock is flagged and routed to a **manager review queue** rather than silently corrected. The manager decides: adjust stock count (physical recount), split the sale, or accept the backorder.
- This satisfies Phase 0's risk register item #2 directly: nothing is silently lost or silently overwritten; a human resolves the ambiguous case.

### 6.4 Data minimization for low-bandwidth
- Sync payloads carry only deltas since last successful sync, not full table dumps.
- No polling — sync is triggered on reconnect (network state change detected) and on a conservative background interval, not continuous polling that burns data allowance on a budget Android device.

---

## Exit Criteria for Phase 1

Per the master spec: **architecture diagram + auth/tenancy spec reviewed and approved before database schema work (Phase 2) begins.**

Specifically, sign-off needed on:
1. The layered architecture above (Section 1).
2. RLS as the binding tenant-isolation mechanism, with the `app.current_tenant_id` resolution pattern (Section 2).
3. REST + the error/pagination/idempotency standards (Section 3).
4. The RBAC permissions matrix draft (Section 4.2) — flag any rows that need to change before Phase 3 implements them.
5. The offline conflict-resolution strategy for inventory (Section 6.3), since this is a customer-facing behavior (what a cashier/manager actually sees when a conflict happens), not just an engineering detail.

Once signed off, Phase 2 (Database Design — ERD, RLS policies as actual SQL, indexing, migrations) can begin.
