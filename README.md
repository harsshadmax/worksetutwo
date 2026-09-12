# Worksetu — Cooperative Gig-Service Platform

**Status: 75% functional prototype / demo.** Built from a Product Requirement
Document for a hackathon submission. This is not a production-certified,
enterprise-ready, or fully secure commercial system — see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) and the Limitations section below before
treating it as one.

## 1. Overview

Worksetu connects customers who need home/local services (plumbing,
electrical, carpentry, painting, caregiving, gardening, cleaning, cooking)
with workers organized into local cooperatives. A dispatch engine matches
each booking to nearby, available, verified workers, offers it to them in
sequence, and tracks the job through acceptance, in-progress, completion,
review, and worker wallet payout.

## 2. Features (implemented, not aspirational)

- Three roles: **Customer**, **Cooperative Worker**, **Platform
  Administrator** (registrar / super-admin).
- Customer: registration, service browsing, booking requests with
  geolocation, live dispatch-matching screen, booking tracking, ratings/
  review submission.
- Worker: registration under a cooperative, admin verification workflow,
  availability toggle with live location pinging, incoming job offers,
  accept/decline, start/complete job, wallet balance + redemption.
- Admin: worker directory + verification (profile and per-skill), dispatch
  monitoring, force-assign, wallet redemption settlement, audit log.
- Dispatch engine: sequential "top 3" offers by distance/continuity score,
  falling back to a broader pool broadcast if unclaimed, with fixed offer
  timeouts and an automatic booking auto-confirm window.
- Wallet system: job payouts, redemption requests, admin settlement,
  balance derivation that correctly excludes already-pending redemptions.
- Multi-language UI (English, Hindi, Tamil, Bengali).
- **Payment: intentionally not connected to a real gateway.** See §14.

## 3. Technology stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML + Vue 3 (CDN, no bundler/build step) + Tailwind CDN |
| Frontend HTTP/socket client | Hand-written `api.js` (fetch wrapper + Socket.io client) |
| Backend | Node.js (TypeScript) + Express 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL + PostGIS (Supabase, pooled via PgBouncer) |
| Cache / locks / rate limiting | Redis (Upstash) via ioredis + rate-limiter-flexible |
| Real-time | Socket.io |
| Scheduled jobs | node-cron |
| Auth | JWT (access token) + httpOnly refresh cookie, bcrypt password hashing |
| Validation | Zod |
| Testing | Jest (unit + integration), Playwright (E2E), Newman/Postman |

## 4. Architecture

```
Browser (index.html + app.js, Vue 3, no build step)
   │  fetch() / Socket.io, base URL from window.WORKSETU_API_BASE
   ▼
Express API (server/src) ── JWT auth, Zod validation, rate limiting
   │
   ├── Prisma ORM ──► PostgreSQL + PostGIS (Supabase)
   ├── ioredis     ──► Redis (Upstash) — locks, rate limits, cache
   └── Socket.io   ──► pushes live dispatch/booking events back to the browser
```

Frontend and backend are two independently deployable services connected
only over HTTP/WebSocket — see [DEPLOYMENT.md](DEPLOYMENT.md).

## 5. Project structure

```
.
├── index.html              # entire frontend UI (Vue 3 app, all views)
├── app.js                  # frontend application logic / Vue composition
├── api.js                  # fetch + Socket.io client wrapper
├── translations.js         # EN/HI/TA/BN UI strings
├── mockData.js             # legacy static reference data — NOT used by
│                            # app.js at runtime (see KNOWN_ISSUES.md); the
│                            # real data source is the seeded Postgres DB
├── render.yaml              # Render Blueprint (frontend + backend)
├── vercel.json               # Vercel config (frontend-only alternative)
├── .env.example              # unified environment variable reference
└── server/
    ├── src/
    │   ├── app.ts             # Express entrypoint
    │   ├── routes/            # one file per resource
    │   ├── controllers/       # request handlers
    │   ├── services/          # dispatch engine, continuity scoring, payment stub
    │   ├── middleware/        # auth, rate limiting, idempotency, error handling
    │   ├── lib/                # prisma client, redis, socket.io, cache
    │   └── utils/              # wallet balance derivation, app-error helpers
    ├── prisma/
    │   ├── schema.prisma       # full data model (PostGIS geometry columns)
    │   ├── migrations/         # applied, versioned SQL migrations
    │   └── seed.ts              # demo data: cooperatives, admin, customers, workers
    ├── tests/                  # Jest unit + integration suites
    ├── e2e/                    # Playwright specs (admin/customer/worker flows)
    ├── package.json / package-lock.json
    └── .env.example
```

## 6. Requirements

- Node.js 18+ (built/tested on Node 24)
- npm
- A PostgreSQL database with the PostGIS extension enabled (Supabase's
  free tier provides this)
- A Redis instance (Upstash's free tier works)

## 7. Installation

```bash
cd server
npm install
```

The frontend has no install step — it's plain static files loaded directly
by the browser.

## 8. Environment setup

Copy the example file and fill in real values:

```bash
cp server/.env.example server/.env
```

See [.env.example](.env.example) at the repo root for every variable used
by both the frontend and backend, with explanations. Never commit a real
`.env` file.

## 9. Database setup

```bash
cd server
npm run prisma:generate     # generate the Prisma client
npm run prisma:deploy       # apply all migrations (safe/idempotent)
npm run prisma:seed         # load demo cooperatives, admin, customers, workers
```

`prisma:seed` prints the demo login credentials it creates when it finishes
— see [DEMO_GUIDE.md](DEMO_GUIDE.md) for the exact ones to use live.

## 10. Local development

```bash
cd server
npm run dev                 # backend on http://localhost:4000
```

Open `index.html` directly in a browser (or serve the repo root with any
static file server, e.g. `npx http-server .`). It defaults to
`http://localhost:4000` for the API — no configuration needed for local dev.

## 11. Production build

```bash
cd server
npm run build                # compiles TypeScript to server/dist
npm start                    # runs the compiled server
```

The frontend has no build step to run.

## 12. Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact, tested deployment
sequence (Render Blueprint for both services, or Render backend + Vercel
frontend).

## 13. Demo

See [DEMO_GUIDE.md](DEMO_GUIDE.md) for the exact sequence to present this
to a judging panel, including working demo login credentials.

## 14. Payment

**Payment gateway integration is intentionally NOT included in this
prototype.** The payment method screen exists in the UI and backend
(Cash / Direct Pay / Online Payment) as a required product-design element.
Cash and Direct Pay are real, working manual-record options. Selecting
Online Payment returns an honest, explicit response —
`"Online payment is not available in this prototype; use Cash or Direct
Pay."` (`PAYMENT_GATEWAY_NOT_CONFIGURED`, HTTP 501) — never a silent no-op
and never a fake success. The payment architecture is a deliberate
extension point for a future real gateway integration.

## 15. Limitations

- This is a hackathon prototype, not a production system: no payment
  gateway, no SMS/email/push provider wired up (interface-ready stubs
  only), no production-grade monitoring/alerting.
- The demo database (Supabase free tier) and Redis (Upstash free tier) can
  exhibit transient connection latency/drops under load — see
  [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
- Document upload is local-disk storage, not cloud object storage.
- `mockData.js` at the repo root is unused dead code from an earlier
  scaffolding pass — the real demo data comes from `server/prisma/seed.ts`.
