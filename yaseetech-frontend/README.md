# YaseeTech Business Cloud — Frontend (Phase 3)

The web dashboard, built to match exactly what the Phase 3 backend
supports — registration, login, your own profile, and a team list gated by
a real RBAC permission. Nothing here is a placeholder for a feature that
doesn't exist in the backend yet.

**Honest status:** like the backend, this was written without network
access to run `npm install` against it. The code is complete and I did a
manual review pass, but "it actually builds" is your first real checkpoint.

---

**Ready to get this off localhost?** See `DEPLOYMENT.md` for a real Vercel
walkthrough, including the CORS/env-var handshake with the backend that's
easy to miss.

## 0. Prerequisites

- Node.js 20+
- **The Phase 3 backend already running** at `http://localhost:3000` (see
  the backend's own README) — this app has nothing to show without it.

## 1. Install and configure

```bash
npm install
cp .env.local.example .env.local
```

The default `.env.local` points at `http://localhost:3000/api/v1`, which
matches the backend's default. Change it if your backend runs elsewhere.

**One backend change you need if you haven't already pulled it:** the
backend's `main.ts` now calls `app.enableCors(...)` and reads a
`FRONTEND_URL` env var — this frontend runs on port **3001** specifically
so it doesn't collide with the backend's default port 3000. Make sure the
backend's `.env` has:
```
FRONTEND_URL=http://localhost:3001
```
(it's already in the backend's `.env.example` if you re-copy it — if
you're on an older `.env`, just add that line).

## 2. Run it

```bash
npm run dev
```

Open **http://localhost:3001**. You should land on `/login`.

## 3. Verify the real flows

1. Click **Register your business** — create a real account. On success
   you land on `/dashboard`, showing your actual profile fetched from
   `GET /users/me` (the JWT + RLS pattern from Phase 3, working end to
   end, not mocked).
2. Click **Team** in the sidebar — this hits `GET /users`, which requires
   the `users.manage` permission. As the registering Business Owner, you
   have it, so you'll see yourself listed.
3. Log out, then log back in with the same credentials — proves the login
   flow and token storage work independently of registration.
4. Open a private/incognito window and register a **second, different**
   business. Confirm its dashboard and team list never show the first
   business's data — the same tenant-isolation guarantee the backend's
   `test/tenant-isolation.e2e-spec.ts` checks automatically, now visible
   in the actual UI.
5. Go to **Inventory**, add a product with a real cost/selling price.
   Go to **Point of Sale**, click the product to add it to the cart,
   pick a payment method, and charge — you should land on a real receipt
   screen showing the transaction number the backend generated. Go back
   to **Inventory** and confirm stock dropped by the quantity sold.
6. Go to **Invoices**, click **+ New invoice**, add a customer by name
   inline, add a line item, and save as a draft. Open it, click
   **Send invoice**, then record a payment — the status badge should move
   from Draft → Sent → Paid, matching what the backend actually computed.

**Before step 6 will work, make sure the backend has run migration 016**
(`016_accountant_permissions_and_ar_backfill.sql`) — it's what backfills
the Accounts Receivable account invoicing needs. `npm run migrate` in the
backend picks it up automatically if you re-run it.

If anything in steps 1–4 doesn't work as described, that's a real bug to
report back, not a setup mistake to work around — this whole app is small
enough that a wrong response almost always traces to one specific file.

---

## Design notes

The visual identity is deliberately not a generic SaaS template — it's
built around the fact that this product manages a ledger. The signature
element is a perforated "ledger tape" (see `globals.css`'s
`.ledger-tape-edge` and `components/LedgerTape.tsx`), used on the auth
screens and echoed in the dashboard's ledger-row profile card. Palette is
grounded in adire indigo-dye and market gold rather than the default
cream-and-terracotta look; type pairs **Fraunces** (a display serif with
real ink-trap character) with **IBM Plex Sans** (UI/body) and **IBM Plex
Mono** (amounts, emails, dates — anything tabular/data-like).

## What's implemented

- `/login`, `/register` — real calls to the backend, real error messages
  surfaced from the API's `{ error: { code, message } }` shape
- `/dashboard` — the caller's own profile, proving JWT + tenant context
- `/dashboard/pos` — real checkout: pick products, adjust quantities,
  choose a payment method, charge. Calls `POST /pos/sales` with a real
  client-generated idempotency key, shows a real receipt from the response
  (not a client-side calculation), and surfaces the backend's negative-stock
  warning if a sale pushes inventory below zero.
- `/dashboard/inventory` — add products, view stock on hand per branch,
  with a low-stock indicator driven by the product's real `reorder_level`
- `/dashboard/invoices` — create draft invoices (add a customer inline or
  pick an existing one, add line items), and `/dashboard/invoices/[id]` to
  send a draft (posting the real accrual journal entry) and record
  payments against it, with status badges reflecting the backend's actual
  computed state, including derived "Overdue"
- `/dashboard/team` — `GET /users`, gated by the `users.manage` RBAC
  permission, with a genuine "you don't have access" state (not just a
  generic error) if that permission is missing
- Automatic access-token refresh on expiry, using the backend's rotating
  refresh tokens, with request queuing so two simultaneous 401s don't race
  each other into a double-refresh
- A sidebar that's honest about scope: only Accounting reports remain
  "coming soon" now, labeled with the phase that will build it

## A known rough edge, stated plainly

Tokens are stored in `localStorage`, not an httpOnly cookie — readable by
any script that runs on the page, which is a real XSS exposure. That's an
acceptable trade-off for local Phase 3 verification, but worth revisiting
(httpOnly cookie + a small backend-for-frontend token exchange) before
this ever holds a real subscriber's session. Flagged in `lib/token-storage.ts`
too, so it isn't a decision that quietly disappears.
