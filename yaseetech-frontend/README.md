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
   screen showing the transaction number the backend generated. Click
   **Download PDF** to save the receipt — it's generated server-side by
   `GET /pos/sales/:id/receipt.pdf` and downloads as a real PDF file. Go
   back to **Inventory** and confirm stock dropped by the quantity sold.
6. Go to **Invoices**, click **+ New invoice**, add a customer by name
   inline, add a line item, and save as a draft. Open it, click
   **Send invoice**, then record a payment — the status badge should move
   from Draft → Sent → Paid. Click **Download PDF** on the invoice detail
   page at any point — it hits `GET /invoices/:id/pdf` and downloads an
   A4 invoice PDF reflecting whatever status/payments exist at that moment.
7. Go to **Accounting**, check the **Profit & Loss** tab shows the sale
   and invoice revenue you just created, and the **Balance Sheet** tab
   does NOT show the red "doesn't balance" warning — if it ever does,
   that's a real bug worth reporting, not something to dismiss.
8. Go to **Branches**, add a second branch. Go to **Team**, add a team
   member with the **Cashier** role scoped to that new branch, using the
   password you set. Log out, log back in as that Cashier, and confirm
   the sidebar's **Team** page shows the "you don't have access" state —
   not an error, a deliberate RBAC block.
9. While still logged in as that Cashier, check the **Overview** page —
   you should see "Today's sales" and "Low stock items" cards, but NOT
   "Outstanding invoices" or "Team members" — those need permissions a
   Cashier doesn't have. Log back in as the Business Owner and confirm
   all four cards appear.
10. On **Team**, click **Edit** next to the Cashier you created, change
    their role to **Branch Manager**, save — confirm the table updates
    immediately. Confirm your own row (the Business Owner) has no Edit
    link at all.
11. On **Inventory**, click **Import CSV** → **Download a template**,
    open it, add a couple more rows (or deliberately leave one blank to
    see the validation work), save, then choose that file. Confirm the
    preview shows the right ready/skipped counts *before* you click
    Import, and that the product list only updates after you actually
    confirm.
12. Click **Settings** (next to your name in the sidebar footer). Update
    your name, confirm it saves and the sidebar updates too. Then open a
    **second browser tab logged in as the same account** (or just note
    you're logged in), change your password in the first tab, and confirm
    you're still logged in there — then try using the app in the second
    tab/session; it should be logged out. That's the real proof the
    "other sessions get revoked" behavior works, not just that the
    password itself changed.

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
- `/dashboard` — real business metrics, not just a profile card: today's
  sales, outstanding invoice total (with overdue count flagged separately),
  low-stock items needing restocking, and active team size. **Field-level
  RBAC**: a Cashier and a Business Owner see genuinely different cards,
  since the backend only includes each section if the caller has the
  permission it depends on — the frontend just renders whatever comes
  back, it doesn't decide what to hide.
- `/dashboard/pos` — real checkout: pick products, adjust quantities,
  choose a payment method, charge. Calls `POST /pos/sales` with a real
  client-generated idempotency key, shows a real receipt from the response
  (not a client-side calculation), and surfaces the backend's negative-stock
  warning if a sale pushes inventory below zero. The receipt screen has a
  **Download PDF** button that fetches `GET /pos/sales/:id/receipt.pdf`
  (a real server-generated PDF, via `apiFetchBlob`) and saves it locally.
- `/dashboard/inventory` — add products, view stock on hand per branch,
  with a low-stock indicator driven by the product's real `reorder_level`.
  Also has a real **bulk CSV import**: choose a file, it's checked against
  `/products/import/preview` immediately (nothing saved yet), showing a
  count of rows ready to import versus rows that will be skipped with the
  specific reason for each (missing field, duplicate SKU in the file,
  duplicate SKU already in your catalog) — only after reviewing that does
  "Import N products" actually write anything. A "Download a template"
  link gives the exact expected column headers.
- `/dashboard/invoices` — create draft invoices (add a customer inline or
  pick an existing one, add line items), and `/dashboard/invoices/[id]` to
  send a draft (posting the real accrual journal entry) and record
  payments against it, with status badges reflecting the backend's actual
  computed state, including derived "Overdue". The invoice detail page
  has a **Download PDF** button next to the status badge, fetching
  `GET /invoices/:id/pdf` for a real A4 invoice PDF.
- `/dashboard/accounting` — Profit & Loss, Balance Sheet, Cash Flow, and
  the raw Journal, all real reports read from the same journal entries POS
  and Invoicing have been posting. The Balance Sheet visibly flags if
  Assets ever stop equaling Liabilities + Equity, which should never
  happen — it's a live check on the backend's double-entry guarantee, not
  a decorative number.
- `/dashboard/team` — `GET /users`, gated by the `users.manage` RBAC
  permission, with a genuine "you don't have access" state (not just a
  generic error) if that permission is missing. Has a real
  "+ Add team member" form: name, email, a password you set directly
  (no email-invite system yet), a role (Branch Manager / Accountant /
  Cashier / Staff — never Business Owner), and a branch for roles that
  need one. Each row also has an **Edit** action that opens inline, real
  role/branch reassignment via `PATCH /users/:id` — except the Business
  Owner's own row, which shows no Edit link at all, matching the
  backend's refusal to let that role be changed here.
- `/dashboard/branches` — list branches, add new ones. Creating a branch
  needs `branches.manage_all` (Business Owner only); a Branch Manager
  hitting the form gets a real 403 from the backend, not a client-side
  guess at what they're allowed to do.
- `/dashboard/settings` — edit your own name/phone (email is intentionally
  not editable here), and change your password. The password form
  correctly handles what the backend actually does on a successful
  change: the response includes a fresh token pair, which gets stored
  immediately so this session keeps working — a naive implementation that
  just showed "success" without updating stored tokens would leave you
  logged in on a soon-to-be-stale access token. Linked from the sidebar
  footer next to your name, not the main nav — it's account-level, not a
  business module.
- Automatic access-token refresh on expiry, using the backend's rotating
  refresh tokens, with request queuing so two simultaneous 401s don't race
  each other into a double-refresh
- `lib/api.ts`'s auth/refresh logic (attach token, retry once on expiry,
  clear session on anything refresh can't fix) is factored into a shared
  `authenticatedFetch()`, used by both `apiFetch<T>()` (JSON responses) and
  `apiFetchBlob()` (binary responses — used for the receipt/invoice PDF
  downloads above) so the two don't duplicate that logic.
- The sidebar has no "coming soon" section anymore — every core v1
  module (POS, Inventory, Invoices, Accounting, Branches, Team) is real

## A known rough edge, stated plainly

Tokens are stored in `localStorage`, not an httpOnly cookie — readable by
any script that runs on the page, which is a real XSS exposure. That's an
acceptable trade-off for local Phase 3 verification, but worth revisiting
(httpOnly cookie + a small backend-for-frontend token exchange) before
this ever holds a real subscriber's session. Flagged in `lib/token-storage.ts`
too, so it isn't a decision that quietly disappears.
