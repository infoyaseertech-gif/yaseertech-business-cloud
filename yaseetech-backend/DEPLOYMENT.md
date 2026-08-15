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
- Railway provisions it and exposes a `DATABASE_URL` — copy it (or better,
  reference it directly; see step 4).

### 4. Set environment variables
On the backend service (not the database) → **Variables**:
```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_ACCESS_SECRET=<run: openssl rand -base64 48>
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=30
FRONTEND_URL=https://your-app.vercel.app
```
`${{Postgres.DATABASE_URL}}` is Railway's variable-reference syntax — it
automatically wires up the database connection without copy-pasting a
connection string. You won't have the real `FRONTEND_URL` until Part 2 —
come back and set it once Vercel gives you a URL. Until then, CORS will
reject the frontend's requests, which is expected and not a bug.

### 5. Run migrations against the real database
Railway doesn't have a built-in "release phase" the way Heroku does, so
run this manually the first time (and again any time a new migration file
is added):
- Railway dashboard → your backend service → **Settings** → note the
  public `DATABASE_URL`, or use Railway's CLI:
```bash
railway login
railway link          # select this project
railway run npm run migrate
```
This runs `scripts/migrate.js` against the real Postgres instance, with
Railway injecting the correct `DATABASE_URL` into the command's
environment. Watch for `ok` printed next to each of the 16 migration
files. If one fails, that's a real bug to fix, not a deploy-config issue.

Optionally: `railway run npm run seed` for the demo dataset.

### 6. Verify
Railway gives the service a public URL (Settings → Networking → Generate
Domain if it isn't already there). Check:
```bash
curl https://your-backend.up.railway.app/api/v1/health
```
Expect `{"status":"ok","database":"connected",...}`. If `database` says
`unreachable`, double-check the `DATABASE_URL` variable reference.

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
