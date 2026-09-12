# Deploying Worksetu

Two services: `worksetu-api` (Express/TypeScript backend — needs a persistent
Node process for Socket.io, node-cron, and the dispatch engine's in-process
timers) and `worksetu-web` (static frontend — no build step). `render.yaml`
at the repo root deploys both from one Blueprint. A Vercel path for the
frontend only is included at the bottom as an alternative.

## 0. Prerequisites

- A GitHub account with this repo pushed to it.
- A Render account (render.com) — free tier is enough for both services.
- Your existing Supabase `DATABASE_URL` / `DIRECT_URL` and Upstash `REDIS_URL`
  (the same ones in your local `server/.env` — this deploy reuses that
  already-migrated, already-seeded database, it does not create a new one).

## Database

- **Requirement**: PostgreSQL with the PostGIS extension enabled (Supabase's
  free tier provides both).
- **Connection strings**: get both from Supabase's dashboard — **Connect**
  button (top of the project page) → select **Prisma** as the framework →
  copy the shown block verbatim into `DATABASE_URL`/`DIRECT_URL`. Don't
  hand-assemble these; two real gotchas confirmed live while deploying this
  project:
  - The pooler username must be `postgres.<project-ref>`, not bare
    `postgres` — the pooler is shared infrastructure and uses the suffix
    to route to your project (bare `postgres` fails with
    `P1000: Authentication failed`).
  - For `DIRECT_URL`, use the **session pooler** (same pooler hostname,
    port `5432`), not Supabase's raw `db.<project-ref>.supabase.co:5432`
    host — that raw host resolves IPv6-only and fails with
    `P1001: Can't reach database server` on IPv4-only hosts like Render,
    even though it works fine locally on a network with IPv6.
- **Migrate**: `cd server && npm run prisma:deploy` (applies
  `prisma/migrations/` — safe/idempotent, only applies what isn't already
  applied; also runs automatically as part of the Render build command
  below).
- **Seed** (demo data — cooperatives, admin, customers, workers): `cd server
  && npm run prisma:seed`. Run this once against a fresh database; it is
  not part of the automatic build/deploy since re-running it against the
  already-seeded production database is unnecessary.

## 1. Push to GitHub

```bash
git add -A
git commit -m "Add deployment configuration"
git push origin main
```

If this repo isn't on GitHub yet:

```bash
gh repo create worksetu --private --source=. --remote=origin --push
```

## 2. Deploy the Blueprint on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect your GitHub account and select this repo. Render reads
   `render.yaml` at the repo root automatically and shows both services
   (`worksetu-api`, `worksetu-web`).
3. Click **Apply**. Render will ask you to fill in the env vars marked
   `sync: false` for `worksetu-api`:
   - `DATABASE_URL` — your Supabase pooled connection string
   - `DIRECT_URL` — your Supabase direct connection string
   - `REDIS_URL` — your Upstash Redis connection string
   - `CORS_ALLOWED_ORIGINS` — leave blank for now, set in step 4
   - `JWT_SECRET` — leave on "generate value" (Render creates a random one)
4. Click **Deploy**. Both services build and deploy — the backend runs
   `npm install && npm run prisma:generate && npm run prisma:deploy &&
   npm run build` then `npm start` (migrations apply automatically and
   safely on every deploy); the frontend stages its static files and
   publishes them.

This step usually takes 3-5 minutes for the backend (TypeScript build +
Prisma client generation) and under a minute for the static frontend.

## 3. Wire the frontend to the backend

1. Once `worksetu-api` is live, copy its URL from the Render dashboard
   (e.g. `https://worksetu-api.onrender.com`).
2. Edit [index.html](index.html) — find this line near the bottom of `<head>`:
   ```html
   window.WORKSETU_API_BASE = "https://REPLACE-WITH-YOUR-BACKEND-URL.onrender.com";
   ```
   Replace the URL with your actual `worksetu-api` URL from step 1.
3. Commit and push:
   ```bash
   git add index.html
   git commit -m "Point frontend at deployed backend"
   git push
   ```
   Render auto-redeploys `worksetu-web` on push (zero manual steps).

## 4. Wire CORS back to the frontend

1. Copy the `worksetu-web` URL from the Render dashboard (e.g.
   `https://worksetu-web.onrender.com`).
2. In the Render dashboard, open `worksetu-api` → **Environment** →
   set `CORS_ALLOWED_ORIGINS` to that exact URL (no trailing slash).
3. Save — Render redeploys `worksetu-api` automatically (env-var-only
   redeploys are fast, no rebuild needed).

## 5. Verify

```bash
curl https://worksetu-api.onrender.com/health
curl https://worksetu-api.onrender.com/ready
```

`/health` should always return 200. `/ready` returns 200 only once both the
database and Redis are reachable — if it returns 503, check the `db`/`redis`
fields in its JSON body and re-check the env vars from step 2.

Then open `https://worksetu-web.onrender.com` in a browser and click through
registration for each role (Customer / Cooperative Worker / Platform
Administrator) to confirm the frontend is reaching the live backend.

## Zero-downtime redeploys

Render's free-tier web services redeploy by starting the new instance,
health-checking it (`healthCheckPath: /health` in `render.yaml`), and only
then routing traffic to it and stopping the old one — every subsequent
`git push` to `main` redeploys both services this way automatically, no
extra configuration needed.

## Alternative: frontend on Vercel instead of Render

`vercel.json` at the repo root is already configured for this if you'd
rather host the static frontend on Vercel and only the backend on Render
(same backend steps 1-2 above, then):

```bash
npm i -g vercel   # once
vercel --prod
```

Deploy from the repo root — it picks up `vercel.json` automatically, no
build step. Then repeat steps 3-4 above using the `https://your-project.vercel.app`
URL in place of the Render frontend URL.
