# YaseeTech Business Cloud — Phase 2 Deliverables
### Database Design

**Depends on:** Phase 1 sign-off (shared-DB + RLS tenant model, `app.current_tenant_id` resolution pattern, REST/error/idempotency standards).

**Code deliverable:** `/migrations/001_extensions.sql` through `/migrations/014_seed_data.sql` — 14 migration files, run in numeric order. The ERD above shows the core relationships; the migration files are the authoritative, complete schema (they include RBAC, invoicing line items, billing, and audit logging, which were left off the diagram for legibility).

⚠️ **Important limitation, stated plainly:** this sandbox has no network access, so these migrations have **not been executed against a live PostgreSQL instance**. I did a careful manual syntax review and a structural sanity check (balanced parentheses, matched `BEGIN`/`END` blocks, dollar-quoted function bodies), and I'm confident in the design, but "run cleanly on a fresh database" — the actual Phase 2 exit criterion — still needs to happen on a real Postgres 15/16 instance before this is trusted in CI. Treat this as a strong first draft ready for that verification pass, not as already-proven code.

---

## 1. What's in each migration

| File | Contents |
|---|---|
| `001_extensions.sql` | `pgcrypto` for UUID generation |
| `002_platform_tables.sql` | `subscription_plans`, `tenants` — the two tables that are *not* tenant-scoped by definition |
| `003_rbac_and_users.sql` | `businesses`, `branches`, `users`, `refresh_tokens`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| `004_inventory.sql` | `products`, `inventory_stock`, `inventory_movements` |
| `005_crm.sql` | `customers` |
| `006_sales.sql` | `sales_transactions`, `sales_transaction_items`, `sales_payments` |
| `007_invoicing.sql` | `invoices`, `invoice_items`, `invoice_payments` |
| `008_accounting.sql` | `accounts`, `journal_entries`, `journal_entry_lines` |
| `009_audit_log.sql` | `audit_logs` + the generic audit trigger function, attached to `users`, `inventory_movements`, `journal_entries` |
| `010_append_only_enforcement.sql` | Triggers blocking UPDATE/DELETE on posted journal entries and inventory movements; the deferred double-entry balance check |
| `011_billing.sql` | `subscriptions`, `payments` (+ its audit trigger, added here since the table didn't exist yet in migration 009) |
| `012_rls_policies.sql` | Row-Level Security enabled + policy created on every tenant-scoped table, in one loop |
| `013_indexes.sql` | Composite `(tenant_id, created_at)` indexes on high-volume tables, FK indexes, two partial indexes |
| `014_seed_data.sql` | Two fully seeded tenants (Amaka Foods & Provisions, Bello Electronics) with businesses, branches, users, roles, products, stock, a sample sale with its journal entries, and an isolation sanity-check query at the bottom |

---

## 2. Financial data integrity rules — how they're actually enforced

Phase 0 required append-only accounting and enforced double-entry bookkeeping. Here's exactly how that's implemented, since "enforced" needs to mean something specific at the database level, not just a policy statement:

- **Append-only:** `journal_entries` and `journal_entry_lines` have a `BEFORE UPDATE OR DELETE` trigger (`fn_block_mutation`) that raises an exception on any attempt to modify or delete a posted row. There is no application code path that can bypass this — corrections are new rows with `source_type = 'reversal'`, linked back via `reverses_entry_id`.
- **Double-entry balance:** a `CONSTRAINT TRIGGER`, deferred to end-of-transaction, sums all `debit_ngn` and `credit_ngn` for a journal entry after its lines are inserted and raises an exception if they don't match. It's deferred because a journal entry and its lines are written in the same transaction — the check can't run until all lines for that entry exist. This is the database-level backstop; the application layer should also validate balance before attempting the insert, so a user gets a clean error message rather than a raw database exception.
- **Inventory movements are append-only too**, with one narrow, explicit exception: the conflict-resolution fields (`is_conflict_flagged`, `conflict_resolved_at`, `conflict_resolved_by`) can be updated — because that's the whole point of the manager review queue from Phase 1, Section 6.3 — but the movement itself (`quantity_delta`, `movement_type`, `product_id`, `branch_id`) cannot. The trigger's `WHEN` clause checks specifically for changes to those protected fields.

---

## 3. Indexing strategy — reasoning, not just the list

- **`(tenant_id, created_at DESC)` composite indexes** on `sales_transactions`, `inventory_movements`, `audit_logs`, `journal_entries` (by `entry_date`), and `payments`. These are the highest-volume, most time-ordered tables, and nearly every real query against them is "this tenant's most recent N rows" — the composite index serves that directly instead of scanning and filtering.
- **Deliberately un-indexed:** `sales_transaction_items` and `journal_entry_lines` beyond their primary key and the tenant index inherited from their parent relationship. These are the highest write-volume child tables — one row per line item on every single sale. Adding indexes here speculatively would slow down POS checkout writes for read patterns that don't exist yet. This is a deliberate omission, not an oversight — add an index only when a specific slow query in production actually justifies it.
- **Two partial indexes** worth calling out: `idx_invoices_tenant_status_due` only indexes invoices in `sent`/`partially_paid`/`overdue` status, since that's exactly the set the "outstanding invoices" dashboard view needs — paid and draft invoices don't bloat the index as they accumulate over years. Similarly, the phone/barcode lookup indexes only index non-null values.

---

## 4. Partitioning — deliberately not done yet, with the trigger condition documented

Phase 2's spec asks for a partitioning plan for `sales_transactions` and `audit_logs`, with the threshold at which it gets implemented documented rather than built prematurely. Here's that threshold:

**Implement partitioning (by month, on `created_at`) when either table crosses ~50 million rows, or when p95 query latency on either table measurably degrades under Phase 8 load testing, whichever comes first.** At Nigerian SME transaction volumes, a single very active business might do a few hundred sales/day; even at 5,000 tenants averaging 50 sales/day each, that's ~250,000 rows/day, or ~90 million rows/year across the whole platform — so this threshold is realistically 6–12 months post-launch, not a v1 concern. Partitioning `sales_transactions` before there's real data to partition adds migration complexity (every query needs to be partition-key-aware) for no measurable benefit yet. This is intentionally deferred, and this paragraph is the record of *why*, so a future engineer doesn't either forget to do it or do it too early.

---

## 5. Read replica strategy

Not implemented in the migrations themselves (that's an infrastructure/connection-routing concern, covered in Phase 8), but the schema doesn't fight it: no tenant-scoped table relies on `SELECT ... FOR UPDATE` or session-level state in a way that would break if reporting queries were routed to a replica with normal replication lag. The one thing to get right at the application layer: **`app.current_tenant_id` must be set on every connection, including ones from the replica pool** — RLS policies apply identically on a replica, but only if the session variable is set the same way. This is a connection-pooling detail worth flagging explicitly for whoever wires up PgBouncer in Phase 8, since it's an easy thing to silently miss when adding a second connection pool.

---

## 6. Migration tooling recommendation

The 14 files here are plain, numbered SQL — deliberately, so they're reviewable independent of any specific framework. For actual CI/CD use, wrap them in a real migration tool rather than running raw `psql` scripts by hand:

- **If the backend is NestJS:** Prisma Migrate or TypeORM migrations both consume raw SQL migrations like these directly, or can be used to author them going forward.
- **If the backend is Django:** these would get translated into Django migrations (Django's migration system doesn't consume raw `.sql` files as cleanly), which is one concrete reason to settle the Node.js-vs-Django question (Phase 1 target stack) before Phase 3 backend work begins in earnest, if it isn't settled already.
- **Either way:** no manual schema changes in production, ever, per Phase 2's spec — every change to this schema from here forward is a new numbered migration file, reviewed and run through the same CI pipeline as everything else.

---

## Exit Criteria for Phase 2

Per the master spec: **ERD reviewed, migrations run cleanly on a fresh database, seed data script produces a realistic multi-tenant test dataset.**

Status:
1. **ERD reviewed** — the core-entity diagram above, plus the full table list in Section 1. Ready for your review.
2. **Migrations run cleanly on a fresh database — not yet verified**, per the limitation stated at the top of this document. This is the one item that needs a real Postgres instance before Phase 3 backend work builds against this schema. Recommended next step: run `001` through `014` in order against a disposable local or CI Postgres 15+ instance, fix anything that surfaces, and treat that as the actual sign-off gate — I'd treat my manual review as a strong draft, not a substitute for that run.
3. **Seed script produces a realistic multi-tenant dataset** — `014_seed_data.sql` seeds two tenants end-to-end and includes a commented-out isolation sanity-check query at the bottom (set `app.current_tenant_id` to Tenant 1, confirm Tenant 2's product never appears). Once the migrations are verified to run, running that check for real is a five-minute confirmation that RLS is doing its job before any application code is even written.

Once the migrations are verified against a real database, Phase 3 (Core Backend: Auth, Tenancy & Platform Foundations) can begin — and it will build directly against this schema, including the tenant-isolation regression test suite the master spec calls out as a permanent CI gate.
