# YaseeTech Business Cloud — Backend (Phase 3)

Real, runnable code for **Phase 3: Auth, Tenancy & Platform Foundations** —
registration, login, JWT + rotating refresh tokens, RBAC permission
checks, and the tenant-context pattern every later phase builds on.

**Honest status:** this was written without network access to run
`npm install` against it, so the dependency tree hasn't been proven to
resolve end-to-end yet. Everything below is the actual verification
process — if something breaks at any step, paste the error back and it
gets fixed directly, rather than guessed at blind.

---

**Ready to get this off localhost?** See `DEPLOYMENT.md` for a real
Railway (backend + Postgres) walkthrough, including the CORS/env-var
handshake with the frontend that's easy to miss.

## 0. Prerequisites

- **Node.js 20+** (`node --version`)
- **Docker** (for local Postgres — or point `DATABASE_URL` at your own
  Postgres 15/16 instance instead and skip the `docker compose` steps)

---

## 1. Install dependencies

```bash
npm install
```

If this fails on a specific package, that's the first thing to report back
— it's the one step this environment couldn't pre-verify.

## 2. Start Postgres

```bash
docker compose up -d
docker compose ps   # wait until postgres shows "healthy"
```

## 3. Configure environment

```bash
cp .env.example .env
```

`.env.example` already has both `DATABASE_URL` (the restricted app role)
and `MIGRATIONS_DATABASE_URL` (the admin/superuser role) pre-filled to
match `docker-compose.yml`'s default local setup — no edits needed for
either if you're using the bundled Postgres container. See "Critical: the
database role you connect as MUST NOT be a superuser" below for why
there are two.

Then edit `.env` and set a real `JWT_ACCESS_SECRET` — the app refuses to
start with the placeholder value:

```bash
openssl rand -base64 48
```

Paste the output in as `JWT_ACCESS_SECRET`.

## 4. Run migrations

```bash
npm run migrate
```

Expected output: all 16 migration files (`001_extensions.sql` through
`016_accountant_permissions_and_ar_backfill.sql`) printing `ok`. **This is
the actual proof that Phase 2's schema is valid** — if anything fails
here, that's a bug in a migration file, not in your setup, and should
come back here to fix.

## 5. (Optional) Seed demo data

```bash
npm run seed
```

Seeds two demo tenants (Amaka Foods & Provisions, Bello Electronics) per
`migrations/014_seed_data.sql`. Their seeded users have a placeholder
password hash and **can't actually log in** — the script says so. To get a
real, working login, just register through the API (step 7) instead.

## 6. Start the app

```bash
npm run start:dev
```

Expected output: `YaseeTech backend listening on http://localhost:3000/api/v1`.

Check it's actually talking to Postgres:

```bash
curl http://localhost:3000/api/v1/health
# {"status":"ok","database":"connected","timestamp":"..."}
```

## 7. Try the real flows

**Register a new business (creates tenant + business + branch + owner user):**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "My Test Shop",
    "ownerFullName": "Test Owner",
    "email": "owner@example.com",
    "password": "a-strong-password-here"
  }'
```
Save the `accessToken` and `refreshToken` from the response.

**Fetch your own profile (proves the JWT + tenant-context pattern works):**
```bash
curl http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer <accessToken from above>"
```

**List tenant users (proves RBAC works — this needs `users.manage`, which a Business Owner has):**
```bash
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <accessToken>"
```

**Refresh the access token:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken from register>"}'
```
Try using the *old* refresh token again after this — it should now be
rejected (`AUTH_INVALID_REFRESH_TOKEN`), since refresh tokens rotate on
every use per Phase 1, Section 4.1.

**Prove tenant isolation manually:** register a *second* business with a
different email, log in as that owner, and confirm their `/users/me` /
`/users` never shows the first business's data. (The automated version of
exactly this is in `test/tenant-isolation.e2e-spec.ts` — see below.)

**Create a product (Phase 4):**
```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"sku":"RICE-50KG","name":"Rice, 50kg bag","costPriceNgn":42000,"sellingPriceNgn":48000}'
```

**Ring up a sale** (replace `<branchId>` and `<productId>` with real IDs from `/branches` and the product response above):
```bash
curl -X POST http://localhost:3000/api/v1/pos/sales \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "<branchId>",
    "items": [{"productId": "<productId>", "quantity": 1}],
    "payments": [{"method": "cash", "amountNgn": 48000}],
    "clientTransactionUuid": "'$(uuidgen)'"
  }'
```
Then check stock dropped by 1: `curl -H "Authorization: Bearer <accessToken>" "http://localhost:3000/api/v1/inventory/stock?branchId=<branchId>"`

**Invoicing (Phase 4b):**
```bash
# Add a customer
curl -X POST http://localhost:3000/api/v1/customers \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"fullName": "Test Customer"}'

# Create a draft invoice (use the customerId and branchId from above)
curl -X POST http://localhost:3000/api/v1/invoices \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"branchId":"<branchId>","customerId":"<customerId>","dueDate":"2026-09-01T00:00:00.000Z","items":[{"description":"Consulting","quantity":1,"unitPriceNgn":50000}]}'

# Send it (use the invoice id from above) -- this is what posts the journal entry
curl -X POST http://localhost:3000/api/v1/invoices/<invoiceId>/send -H "Authorization: Bearer <accessToken>"

# Record a payment
curl -X POST http://localhost:3000/api/v1/invoices/<invoiceId>/payments \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"amountNgn": 50000, "method": "transfer"}'
```

**Accounting reports (Phase 6):**
```bash
# Profit & Loss for this month so far
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3000/api/v1/accounting/profit-and-loss?startDate=2026-08-01&endDate=2026-08-31"

# Balance Sheet as of today -- check isBalanced is true
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3000/api/v1/accounting/balance-sheet?asOfDate=2026-08-31"

# The raw journal -- every entry POS/Invoicing has posted, audit-trail style
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3000/api/v1/accounting/journal?limit=20"
```

**Accounting reports (Phase 6)** — these read what POS/Invoicing already posted, so run them after doing a sale or two above:
```bash
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3000/api/v1/accounting/profit-and-loss?startDate=2026-01-01&endDate=2026-12-31"

curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3000/api/v1/accounting/balance-sheet"
# check "isBalanced": true in the response -- that's the real correctness proof
```

**Multi-branch and team (Phase 5):**
```bash
# Add a second branch
curl -X POST http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"name": "Second Branch", "address": "Somewhere else"}'

# Add a Cashier, scoped to the main branch (use a real branchId from GET /branches)
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"fullName":"Test Cashier","email":"cashier@example.com","password":"a-strong-password","role":"Cashier","branchId":"<branchId>"}'

# Log in as that cashier, then confirm they CANNOT list the team (should be 403)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cashier@example.com","password":"a-strong-password"}'
curl -H "Authorization: Bearer <cashierAccessToken>" http://localhost:3000/api/v1/users
```

## 8. Run the tenant-isolation regression test

```bash
npm run test:e2e
```

This registers two real tenants through the real HTTP API and asserts
neither can see the other's data — the permanent CI gate Phase 1 called
for. If this ever fails, nothing else about the platform should be trusted
until it passes again.

---

## What's actually implemented in this phase

- `POST /auth/register` — self-serve signup: creates a tenant, its first
  business, a main branch, and the founding user as **Business Owner**, all
  in one transaction.
- `POST /auth/login`, `POST /auth/refresh` (rotating), `POST /auth/logout`
- `GET /users/me` — any authenticated user
- `GET /users` — requires the `users.manage` permission (RBAC in action)
- `GET /branches` — list the tenant's branches
- `GET /products`, `GET /products/:id`, `POST /products` — product catalog,
  gated by `inventory.view` / `inventory.manage`
- `POST /products/import/preview`, `POST /products/import/commit` — bulk
  CSV product import, gated by `inventory.manage`. Per Phase 0's risk
  register (item 7: bulk import can silently corrupt an existing catalog),
  this is deliberately two calls, not one: **preview** parses and
  validates every row against both the file itself (duplicate SKUs within
  the CSV) and the existing catalog (duplicate SKUs already in the
  database), writing nothing — the frontend shows exactly what would
  happen before anything is saved. **Commit** re-validates from scratch
  (never trusts that what the client previewed is still accurate — someone
  else on the team could have added a conflicting SKU in the meantime) and
  imports only the rows that pass; invalid rows are skipped and reported,
  not treated as a reason to reject the whole file. A row with an opening
  quantity creates a real `inventory_stock` row and an `inventory_movements`
  entry (append-only ledger, same as every other stock change), not a
  bare number with no audit trail.
- `GET /inventory/stock?branchId=`, `POST /inventory/adjustments` — stock
  levels and manual adjustments (recount/damage/spoilage/theft), each
  writing an append-only `inventory_movements` row and flagging negative
  stock for manager review rather than blocking the write, per Phase 1,
  Section 6.3
- `POST /pos/sales`, `GET /pos/sales` — the full checkout path: creates the
  sale, its line items, its payment(s), the resulting inventory movements,
  and the auto-generated double-entry journal entry, all in one
  transaction. Idempotent on `client_transaction_uuid` — retrying the same
  sale is a safe no-op, which is what makes offline POS sync safe later.
- `GET /customers`, `POST /customers` — minimal CRM, just enough to attach
  a customer to an invoice.
- `GET /invoices`, `GET /invoices/:id`, `POST /invoices`,
  `POST /invoices/:id/send`, `POST /invoices/:id/payments` — draft
  invoices post no accounting entry; **sending** one posts the accrual
  entry (Dr Accounts Receivable / Cr Sales Revenue); **recording a
  payment** posts the cash/AR relief entry (Dr Cash / Cr Accounts
  Receivable) and recomputes status from the real sum of payments, not a
  trusted running counter.
- `GET /branches`, `POST /branches` — list and create branches;
  creating one requires `branches.manage_all` (Business Owner only —
  `branches.manage_own`, held by Branch Manager, scopes someone to
  operating an existing branch, not creating new ones).
- `GET /users`, `POST /users` — team management. `POST /users` adds a
  teammate to your own tenant with an assigned role (`Branch Manager`,
  `Accountant`, `Cashier`, or `Staff` — never `Business Owner`, which is
  only ever created at registration) and, for branch-scoped roles, a
  required branch. There's no email/SMS invite system yet (Phase 8
  infrastructure) — the Business Owner sets the new teammate's password
  directly and shares it out of band.
- `GET /accounting/profit-and-loss?startDate=&endDate=` — revenue minus
  expenses for a period, read directly from `journal_entry_lines`.
- `GET /accounting/balance-sheet?asOfDate=` — assets, liabilities, and
  equity as of a date, with cumulative net income folded into a
  "Retained Earnings" line since there's no period-closing process yet.
  Returns `isBalanced: true/false` as a live sanity check — should always
  be `true` given the database's double-entry trigger; if it's ever
  `false`, that's a real bug worth reporting immediately.
- `GET /accounting/cash-flow?startDate=&endDate=` — cash movement by
  source (POS sales, invoice payments, manual entries) — a simplified
  cash-movement report, not a full GAAP indirect-method statement.
- `GET /accounting/journal?startDate=&endDate=&limit=` — the raw audit
  trail: every journal entry and its lines, most recent first.
- `GET /accounting/chart-of-accounts` — every account with its current
  balance.
- `PATCH /users/:id` — reassigns an existing team member's role and/or
  branch. Refuses outright to edit whoever currently holds the Business
  Owner role — that role only exists via registration, and there's no
  ownership-transfer feature, so allowing this would risk a business
  locking itself out of its own account with no way to reverse it. Assumes
  one role per user at a time (deletes the existing `user_roles` row and
  inserts the new one) — the schema technically allows more, but nothing
  in this app creates that yet.
- `GET /dashboard/summary?branchId=` — the numbers behind the Overview
  page: today's sales, low-stock items, outstanding invoice total, active
  team size. **Field-level RBAC, not endpoint-level**: every authenticated
  role can call this, but each section only appears if the caller actually
  has the permission it depends on (today's sales needs `pos.create_sale`
  or `accounting.view`; outstanding invoices needs `invoicing.manage`;
  team size needs `users.manage`) — a Cashier and a Business Owner calling
  this endpoint get genuinely different response shapes, not the same data
  with something hidden client-side.
- `GET /health` — checks the database connection
- **Row-Level Security enforced from application code**: `DatabaseService.withTenantContext()`
  sets `app.current_tenant_id` per-transaction from the verified JWT —
  never from anything client-supplied — so every RLS policy from
  Phase 2's migrations applies automatically.
- **RBAC**: `PermissionsGuard` checks the caller's actual `role_permissions`
  against the database on every protected request (not a cached claim in
  the JWT), so a permission change takes effect immediately.
- Consistent error shape (`{ error: { code, message, details } }`) on every
  endpoint, per Phase 1, Section 3.
- **CORS enabled** (`FRONTEND_URL` env var) so the separate Next.js
  frontend can call this API.

## What's explicitly NOT in this project yet (by design)

- **Subscription billing (Flutterwave).** The one real gap left from the
  original v1 module list. Needs a real Flutterwave account and sandbox
  keys before it can be built and tested properly — external setup, not
  something buildable blind.
- **Email/SMS invite system.** `POST /users` (Phase 5) adds a teammate
  directly with a password the Business Owner sets and shares out of
  band — there's no invite-link-with-expiry flow, because there's no
  notification infrastructure yet (Phase 8).
- Redis-backed rate limiting — the Phase 1 design calls for Redis at the
  API-gateway layer; this project runs standalone with no gateway or
  Redis yet, so rate limiting is deliberately deferred rather than
  half-built.
- Offline sync itself (the mobile POS client) — the backend's schema and
  idempotency design (`client_transaction_uuid`) are already built for it;
  the actual offline-capable client is a separate, later build.
- 2FA / SSO — the `users` table already has the columns reserved
  (Phase 1, Section 4.3), but nothing reads or writes them yet.
- Resetting a teammate's password, or editing their name/email —
  `PATCH /users/:id` covers role/branch reassignment only, deliberately.
  Password resets and contact-info edits are different, more sensitive
  operations that deserve their own validation and audit trail rather
  than being bundled into this endpoint.

## A small refactor worth knowing about

While building the dashboard summary, the permission-lookup query that
`PermissionsGuard` used inline got extracted into
`src/common/auth/permissions.helper.ts` (`getUserPermissionCodes`), since
the dashboard needed the exact same lookup for its field-level visibility
logic. Both now call the same function — worth knowing if you're modifying
RBAC behavior, since there's only one place that needs to change now,
not two that could quietly drift apart.

## Known simplifications in the POS/accounting integration, stated plainly

- **Every payment method posts to the same "Cash" account** in the
  auto-generated journal entry. A real chart of accounts would route
  card/transfer payments to an "Undeposited Funds" or bank clearing
  account — that's Phase 6 (Accounting) scope, not invented here.
- **Tax is hardcoded to 0** on every sale. The Phase 0 rule against
  hardcoding tax rates is respected by *not* charging one yet, rather than
  guessing — a configurable tax-rate table is Phase 6 scope.
## A real bug found and fixed while building Phase 4b

**Registration never seeded a chart of accounts.** Only the demo seed data
(`014_seed_data.sql`) had one, which meant every genuinely registered
business would have hit `CHART_OF_ACCOUNTS_NOT_SEEDED` the moment they
tried to check out at the POS or send an invoice — a real gap in what was
previously delivered as "done." Fixed in `AuthService.register`, which now
seeds the standard chart (Cash, Accounts Receivable, Inventory, Sales
Revenue, COGS) for every new tenant. A new migration
(`016_accountant_permissions_and_ar_backfill.sql`) backfills the missing
Accounts Receivable account onto the existing demo tenant, and also fixes
a second gap found in the same pass: **the Accountant role had no
`role_permissions` at all** in the original seed data — present in the
RBAC matrix, silently missing from the actual seed inserts.

**Run migration 016 before testing invoicing**, even if you already ran
001–015 previously — `npm run migrate` re-runs the full set and picks it
up automatically.

## Known simplifications in invoicing, stated plainly

- **Draft invoices post no journal entry.** Only sending one does (accrual
  basis) — a draft is a document being prepared, not yet a real accounting
  event.
- **"Overdue" is computed on read, not stored.** Flipping a stored status
  to `overdue` for real needs a scheduled job (Phase 8 infrastructure
  doesn't exist yet), so `isOverdue` is derived from `due_date` at query
  time instead — functionally correct for now, worth revisiting once
  background jobs exist.
- **Invoice numbers are time-based, not a gapless sequence**, same
  reasoning and same caveat as POS receipt numbers.

## Critical: the database role you connect as MUST NOT be a superuser

This isn't a style preference — it's the difference between tenant
isolation actually working and silently not working at all.

**What happened:** during real local testing (not caught by the automated
tests, which use whatever role runs them), the app was connected to
Postgres as a superuser — Railway's default `postgres` account, and (it
turns out) this project's own `docker-compose.yml` had the exact same
problem: the official Postgres image makes `POSTGRES_USER` a superuser
automatically. **PostgreSQL superusers bypass Row-Level Security
unconditionally, regardless of `FORCE ROW LEVEL SECURITY`.** Every RLS
policy in this schema (migration 012) was being silently ignored. The
symptom: a freshly registered business could see other tenants' branches
and team member counts on its own dashboard — a real cross-tenant data
leak, caused entirely by *which role* was connecting, not a flaw in the
policies themselves.

**This is now fixed structurally, not just documented as someone else's
problem to remember:**

- `docker-compose.yml` mounts `docker/init-app-role.sql`, which
  automatically creates a restricted `yaseetech_app` role (`NOSUPERUSER
  NOBYPASSRLS`) the first time the container starts, with default
  privileges set up so it automatically gets access to tables created
  later by migrations.
- `.env.example` now has **two** connection strings:
  `DATABASE_URL` (the restricted role — what the running app actually
  connects as) and `MIGRATIONS_DATABASE_URL` (an admin/superuser
  connection, used only by `npm run migrate` and `npm run seed`, which
  need privileges like `CREATE TABLE` that the restricted role
  deliberately doesn't have).
- If you already have an existing local Postgres volume from before this
  fix, the init script won't retroactively run (`docker-entrypoint-initdb.d`
  scripts only run on first container creation) — run `docker compose down
  -v` (removes the volume) then `docker compose up -d` again to get a
  fresh container that picks it up.

**On a managed provider (Railway, Supabase, etc.) that hands you a
superuser by default**, run the equivalent manually against that
database before pointing `DATABASE_URL` at it:

```sql
CREATE ROLE yaseetech_app WITH LOGIN PASSWORD '<a real password>' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO yaseetech_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO yaseetech_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO yaseetech_app;
```

(Use `ALL TABLES`/`ALL SEQUENCES` here, not `ALTER DEFAULT PRIVILEGES`,
since on a provider like this the tables already exist from migrations
you've already run — unlike the local Docker init script, which runs
*before* any table exists.)

**Worth adding to CI eventually:** a test that explicitly checks
`SELECT rolsuper FROM pg_roles WHERE rolname = current_user` returns
`false` against whatever role the app is actually configured to use in
each environment — this class of bug is exactly the kind that's invisible
until someone looks at real data from a second account, which is easy to
never do until a customer does it for you.

## Known simplifications in accounting reports (Phase 6), stated plainly

- **Cash Flow is a cash-movement report, not a full GAAP Statement of Cash
  Flows.** It shows what moved through the Cash account grouped by source
  (POS sales, invoice payments, manual entries) — not the indirect-method
  reconciliation of net income to cash via working-capital adjustments
  that a formal cash flow statement does. That's meaningfully more complex
  and isn't what an SME owner asking "where did my cash go" actually needs.
- **No period-closing process.** There's no year-end journal entry that
  zeroes out revenue/expense accounts into a permanent equity balance.
  Instead, the Balance Sheet folds cumulative net-income-since-inception
  directly into a "Retained Earnings (cumulative)" line on every request.
  This keeps the balance sheet mathematically balanced (guaranteed by the
  database's double-entry trigger) without a closing-entry feature v1
  doesn't have — a real close-the-books process is reasonable v2 scope
  once there's a fiscal year concept to close against.
- **Report query parameters aren't validated with DTOs** the way write
  endpoints are — `startDate`/`endDate`/`asOfDate` are taken as plain
  query strings, matching the pattern already used for `branchId` filters
  elsewhere. A malformed date will produce a Postgres error, not a clean
  `VALIDATION_ERROR` — worth tightening if these become user-facing forms
  rather than internal report tools.

## A known rough edge, stated plainly

`DatabaseService.withTenantContext` interpolates `tenantId`/`userId` into
`SET LOCAL` statements (Postgres doesn't support parameters there), guarded
by `assertValidUuid`. This is safe given where those values come from (a
verified JWT, never a raw request parameter) — but it's worth a second
pair of eyes before this schema/pattern is trusted with real subscriber
money, precisely because "safe because of where the input comes from"
is the kind of assumption worth re-verifying rather than taking on faith.
