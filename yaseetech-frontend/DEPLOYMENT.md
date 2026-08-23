# Deploying YaseeTech Business Cloud

Two separate deployments: the NestJS backend + Postgres on **Railway**,
the Next.js frontend on **Vercel**. Both have generous free tiers, both
connect straight to a GitHub repo, and both are a reasonable default for
getting this off localhost without committing to real infrastructure
spend yet.

**Honest status:** I can't deploy this for you — no way to push to Railway
or Vercel, create accounts, or click their buttons from here. Everything
below is a real, specific walkthrough, but you're the one running it, and
if a step doesn't match what you see in their dashboard (they change UI
fairly often), that's worth pasting back here rather than guessing.

---

## Part 1: Backend on Railway

### 1. Push the backend to its own GitHub repo
Railway deploys from GitHub. If `yaseetech-backend` isn't already a git
repo:
```bash
cd yaseetech-backend
git init
git add .
git commit -m "Phase 4b: POS, inventory, invoicing"
```
Create a new repo on GitHub and push to it.

### 2. Create the Railway project
- railway.app → **New Project** → **Deploy from GitHub repo** → pick your
  backend repo.
- Railway will detect the `Dockerfile` (via `railway.json`) and build from
  that automatically — no build settings to configure by hand.

### 3. Add PostgreSQL
- In the same Railway project: **New** → **Database** → **Add PostgreSQL**.
- Railway provisions it and exposes `DATABASE_URL` — **do not wire this
  directly to your backend service.** It connects as Railway's default
  `postgres` account, which is a **superuser**, and PostgreSQL superusers
  silently bypass Row-Level Security — every tenant-isolation policy in
  this schema would be ignored, and one business could see another's data.
  This is a real bug that was found the hard way; see "Critical: the
  database role you connect as MUST NOT be a superuser" in the backend's
  own `README.md` for the full story.

### 4. Create the restricted application role
Before setting any environment variables, connect to this new Postgres
instance (its **Connect** tab has a `psql` command, or use any Postgres
client) and run:
```sql
CREATE ROLE yaseetech_app WITH LOGIN PASSWORD '<a real password>' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO yaseetech_app;
```
(The `GRANT ... ON ALL TABLES` step comes after migrations run, in step 6
below — there are no tables yet at this point.)

### 5. Set environment variables
On the backend service (not the database) → **Variables**:
```
NODE_ENV=production
DATABASE_URL=postgresql://yaseetech_app:<the password you set>@<private host from Postgres's Connect tab>:5432/railway
MIGRATIONS_DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_ACCESS_SECRET=<run: openssl rand -base64 48>
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=30
FRONTEND_URL=https://your-app.vercel.app
```
For `DATABASE_URL`, use Postgres's **Private Network** hostname (Connect
tab → "Private Network", something like `postgres.railway.internal`) —
your backend service and Postgres already live in the same Railway
project, so there's no need to route through the public endpoint (which
costs egress and needlessly exposes the database to the internet) just
to talk to each other. Reserve the public endpoint from step 4 for
one-off external access, like running a manual `psql` session from your
own machine.

`DATABASE_URL` (restricted role) is what the running app connects as.
`MIGRATIONS_DATABASE_URL` uses Railway's own superuser reference — that's
fine here, since it's only ever used for the one-off migration run in
step 6, never by the running application. You won't have the real
`FRONTEND_URL` until Part 2 — come back and set it once Vercel gives you
a URL. Until then, CORS will reject the frontend's requests, which is
expected and not a bug.

### 6. Run migrations against the real database, then grant the app role access
Railway doesn't have a built-in "release phase" the way Heroku does, so
run this manually the first time (and again any time a new migration file
is added):
```bash
railway login
railway link          # select this project
railway run npm run migrate
```
This runs `scripts/migrate.js`, which prefers `MIGRATIONS_DATABASE_URL`
(the superuser connection) precisely so it can create tables/triggers
that the restricted role can't. Watch for `ok` printed next to each of
the 16 migration files. If one fails, that's a real bug to fix, not a
deploy-config issue.

**Now that tables exist**, go back to the Postgres connection from step 4
and finish granting the app role access:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO yaseetech_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO yaseetech_app;
```

Optionally: `railway run npm run seed` for the demo dataset.

### 7. Verify
Railway gives the service a public URL (Settings → Networking → Generate
Domain if it isn't already there). Check:
```bash
curl https://your-backend.up.railway.app/api/v1/health
```
Expect `{"status":"ok","database":"connected",...}`. If `database` says
`unreachable`, double-check the `DATABASE_URL` variable reference.

**Then verify RLS is actually working, not just "connected"** — register
two different businesses through the real live URL and confirm neither
sees the other's branches, team, or data anywhere. This is the check that
would have caught the superuser bug immediately; don't skip it just
because `/health` looks fine — a superuser connection reports
`"connected"` too.

---

## Part 2: Frontend on Vercel

### 1. Push the frontend to its own GitHub repo
Same as the backend — separate repo, separate deploy.
```bash
cd yaseetech-frontend
git init
git add .
git commit -m "Phase 4b: POS, inventory, invoicing UI"
```

### 2. Import into Vercel
- vercel.com → **Add New** → **Project** → import the frontend repo.
- Vercel auto-detects Next.js (the committed `vercel.json` just confirms
  it). Leave build settings on their defaults.

### 3. Set the one environment variable it needs
Project → **Settings** → **Environment Variables**:
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app/api/v1
```
Use the real Railway URL from Part 1, Step 6. Set this for all three
environments Vercel offers (Production, Preview, Development) unless you
want previews pointing somewhere else.

### 4. Deploy
Vercel deploys automatically on push. First deploy happens right after you
import the project.

### 5. Close the loop: update the backend's CORS setting
Now that Vercel has given you a real URL (e.g.
`https://yaseetech.vercel.app`), go back to Railway and set:
```
FRONTEND_URL=https://yaseetech.vercel.app
```
Railway redeploys automatically when a variable changes. **This step is
easy to forget and is the single most common reason a fresh deploy "looks
broken"** — the frontend loads fine (it's static/serverless, no CORS
issue there), but every API call fails silently with a CORS error visible
only in the browser console, not as a normal error message.

---

## Verifying the real deployment

Same checklist as local, just against real URLs:

1. Visit your Vercel URL → should land on `/login`.
2. Register a new business → should land on the dashboard, showing your
   real profile fetched from the deployed backend.
3. Open browser dev tools → Network tab while doing this. If you see CORS
   errors, it's Step 5 above (`FRONTEND_URL` not set or not redeployed
   yet).
4. Run through POS → Inventory → Invoices exactly as in each project's own
   README, now against the deployed backend instead of localhost.
5. Open a private/incognito window, register a second business, confirm
   the same tenant-isolation guarantee holds against the real deployed
   database, not just your local one.

## A known gap worth naming

Neither Railway nor this Dockerfile does anything about **connection
pooling** (PgBouncer) yet — Phase 1's architecture doc calls this out as
necessary at real scale, but it's not needed for verifying correctness
with a handful of test users. Worth revisiting before this handles actual
paying tenants, not before this deployment check.
