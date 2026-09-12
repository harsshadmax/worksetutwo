# Project Manifest — Worksetu

Machine/human-readable inventory of the actual implementation, verified by
direct inspection of the repository (not assumed).

- **Project name**: Worksetu — Cooperative Gig-Service Platform
- **Status**: 75% functional prototype / demo (not production-certified)

## Frontend

- **Framework**: Vue 3 (`vue@3`, loaded via CDN — `unpkg.com/vue@3/dist/vue.global.js`), no bundler/build step
- **Styling**: Tailwind CSS (CDN, `cdn.tailwindcss.com`)
- **Icons/fonts**: Font Awesome 6.4.0 (CDN), Google Fonts (Inter, Noto Sans Devanagari/Tamil)
- **Real-time client**: Socket.io client 4.8.0 (CDN)
- **Entry point**: `index.html` (single-page app, all views inline)
- **Application logic**: `app.js` (Vue Composition API, all state/handlers)
- **API client**: `api.js` (fetch wrapper + Socket.io connection, base URL from `window.WORKSETU_API_BASE`)
- **i18n**: `translations.js` (English, Hindi, Tamil, Bengali)
- **Runtime config**: one inline `<script>` in `index.html` setting `window.WORKSETU_API_BASE`
- **Build configuration**: none — static files served as-is

## Backend

- **Framework**: Express 4.21 on Node.js (TypeScript 5.6)
- **Entry point**: `server/src/app.ts`
- **Routes**: `server/src/routes/*.routes.ts` — auth, workers, public, services, cooperatives, users, notifications, bookings, dispatch, customers, admin, admin-payment, documents, document-signed, health
- **Controllers**: `server/src/controllers/*.controller.ts`
- **Services**: `server/src/services/*.service.ts` — dispatch engine, continuity scoring, booking state machine, dispatch reconciliation sweep, payment stub adapters
- **Middleware**: `server/src/middleware/` — JWT auth (`auth.ts`), rate limiting (Redis-backed, `rate-limit.ts`), idempotency-key handling, request-id/request-logger, centralized error handler
- **Authentication**: JWT (HS256) access tokens + httpOnly refresh-token cookie; bcrypt password hashing
- **Validation**: Zod schemas at every mutating endpoint
- **API architecture**: REST under `/api/v1/*`, consistent `{"error":{"code","message","requestId"}}` envelope, 404 (not 403) for ownership-mismatch IDOR protection
- **Real-time**: Socket.io attached to the same HTTP server (`server/src/lib/socket.ts`)
- **Scheduled jobs**: node-cron (`server/src/services/dispatch-reconciliation.service.ts`)

## Database

- **Technology**: PostgreSQL + PostGIS extension (hosted on Supabase)
- **ORM**: Prisma 5.20
- **Schema**: `server/prisma/schema.prisma`
- **Migrations**: `server/prisma/migrations/` — 3 applied migrations (`20260826155245_init`, `20260826155347_spatial_indexes`, `20260826183627_notification_dedupe_key`)
- **Seed data**: `server/prisma/seed.ts` — 4 cooperatives, 1 admin, 2 customers, 8 workers across 4 Indian cities with real lat/lng coordinates
- **Connection**: pooled via PgBouncer (`DATABASE_URL`, transaction mode) for the running app, direct connection (`DIRECT_URL`) for migrations only

## Cache / real-time infrastructure

- **Redis**: Upstash-hosted, accessed via ioredis
- **Used for**: dispatch/booking locks (`redis-lock.ts`), rate limiting (`rate-limiter-flexible`), response caching (`cache.ts`), rate-limit state

## Package manager & runtime

- **Package manager**: npm (`server/package-lock.json` present and committed)
- **Node.js**: 18+ required; built and tested on Node 24
- **Frontend**: no package manager — CDN script tags only

## Main dependencies (backend, production)

`@prisma/client`, `bcrypt`, `cookie-parser`, `cors`, `dotenv`, `express`, `helmet`, `ioredis`, `jsonwebtoken`, `multer`, `node-cron`, `rate-limiter-flexible`, `socket.io`, `zod`

## Environment variables (full list — see `.env.example`)

`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `REDIS_URL`, `PORT`, `NODE_ENV`, `CORS_ALLOWED_ORIGINS`, `EMAIL_PROVIDER`, `SMS_PROVIDER`, `PUSH_PROVIDER` (backend); `window.WORKSETU_API_BASE` (frontend, set inline in `index.html`, not a `.env` variable — the frontend has no build step)

## Deployment architecture

```
worksetu-web (static, Render or Vercel)  ──HTTP/WS──►  worksetu-api (Node, Render)  ──►  Supabase Postgres+PostGIS
                                                                  │
                                                                  └──►  Upstash Redis
```

Two independently deployable services. See `render.yaml` (Blueprint for
both) and `vercel.json` (frontend-only alternative).

## Build commands

- Backend: `cd server && npm install && npm run prisma:generate && npm run prisma:deploy && npm run build`
- Frontend: none (static files)

## Start commands

- Backend: `npm start` (runs `node dist/app.js`)
- Frontend: served as static files by the hosting platform

## Seed command

- `cd server && npm run prisma:seed`

## Test commands (not part of the deployment path, included for completeness)

- `npm test` (unit + integration, Jest)
- `npm run test:e2e` (Playwright)
- `npm run test:postman` (Newman, against the literal Postman collection)

## Prototype limitations (see KNOWN_ISSUES.md for detail)

- No payment gateway connected (deliberate — see README §14)
- No SMS/email/push provider wired to a real service
- Local-disk document storage, not cloud object storage
- Free-tier Supabase/Upstash can exhibit transient connection latency under load
