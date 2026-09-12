# Known Issues — Worksetu Prototype

Genuine issues only, found via extensive testing (42/42 unit tests, a
consistently 37-39/39 integration suite against the real database, and
repeated live Playwright E2E runs through a real browser). No deployment-
blocking issue was found in the application logic itself.

## CRITICAL

None. The application builds, boots, connects to the database and Redis,
and all three core user flows (customer, worker, admin) have been verified
working end-to-end through a real browser this session.

## HIGH

1. **Uploaded documents do not persist across a redeploy or restart on
   Render's free tier.** Document upload (`server/storage-private/`) writes
   to local disk, which is ephemeral on Render's standard/free web
   services — any file uploaded during a demo will be gone after the next
   deploy or a dyno restart. Works correctly for a single demo session; not
   durable for real use. Fix would require swapping in cloud object storage
   (e.g. S3-compatible), which is out of scope for this prototype pass.

2. **Free-tier database/cache connection instability.** The Supabase
   (Postgres) and Upstash (Redis) free tiers used for this deployment
   exhibit occasional transient connection drops and elevated latency
   under sustained load — observed directly and repeatedly during this
   session's testing (live `P1001` connection errors, Redis `ECONNRESET`,
   occasional multi-second request latency spikes). The application
   already handles this gracefully where it matters most (bounded
   timeouts on cache/lock/rate-limit paths, no server crashes), but an
   individual request can still occasionally fail or be slow during a live
   demo. See DEMO_GUIDE.md's backup plan.

## MEDIUM

3. **`npm audit` reports 19 known vulnerabilities in the locked dependency
   tree** (2 critical, 10 high, 7 moderate), confirmed via a clean
   `npm install` from `package-lock.json`. These are pre-existing in the
   current dependency versions, not something introduced by this
   packaging pass. Deliberately not run through `npm audit fix --force`
   here — that upgrades dependencies (including possible breaking major
   versions) without the runway to re-test, which the "don't upgrade
   dependencies unnecessarily" constraint on this pass rules out. Run
   `npm audit` yourself to see the specific packages before addressing
   this outside the demo timeline.

4. **The scheduled dispatch-reconciliation sweep (node-cron) can miss
   ticks under sustained CPU/IO load** on the single-process free-tier
   host — observed during heavy automated test runs (logged as "missed
   execution" warnings). Low practical impact for a demo (light traffic),
   but worth knowing before assuming background jobs are running on a
   strict schedule under real load.

## LOW

5. **`mockData.js` at the repo root is unused dead code.** It's loaded by
   `index.html` but nothing in `app.js` reads `window.mockData` — the real
   demo data source is the seeded Postgres database
   (`server/prisma/seed.ts`). Harmless; kept rather than removed per the
   "don't remove existing files unnecessarily" packaging rule.

6. **No automated cross-browser/mobile-viewport testing was run** this
   pass — Playwright E2E coverage used a single desktop Chromium
   configuration. The UI is responsive (Tailwind), but mobile layouts
   haven't been explicitly verified.

## Explicitly not an issue (by design, not a gap)

- **No payment gateway integration.** This is a deliberate requirement,
  not an incomplete feature — see README.md §14.
- **No SMS/email/push provider wired to a real service.** Interface-ready
  stubs exist (`EMAIL_PROVIDER`/`SMS_PROVIDER`/`PUSH_PROVIDER` env vars);
  wiring a real provider was out of scope for this prototype pass.
