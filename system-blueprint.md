# Worksetu Production Blueprint

Cooperative Gig-Service Platform — Smart India Hackathon Prototype Engineering PRD and Single Source of Truth for Claude Code

Version 3.0 (Hackathon Prototype Scoping Pass) — Supersedes Version 2.0 in place. Generated from the existing frontend codebase (`index.html`, `app.js`, `mockData.js`, `translations.js`) and re-scoped from a production-commercial build to a **~75% functional, demoable Smart India Hackathon prototype**. No product redesign occurred in this pass: all Version 1.0/2.0 features, workflows, API paths, schema entities, and terminology are preserved. This pass re-prioritizes Version 2.0's requirements against hackathon constraints (time, no paid infrastructure, no external accounts) — see Section 0.4 for the P0/P1/P2/OUT functional priority classification that governs what Claude Code must build first and what is explicitly deferred. Mock/seed data is a required part of this prototype, not a removal target (Section 1.4, 19.2).

Target stack: Node.js + TypeScript (Express) · PostgreSQL via Supabase with PostGIS · Prisma ORM · Redis (ioredis) · Socket.io · Postman v2.1 — this is a **real, working full-stack system** (real database, real APIs, real business logic) populated with realistic seed data for demo purposes; it is not a frontend-only mockup.

Payments: Native local wallet ledger, Cash, and Direct-Pay recorded-by-platform transactions only. Worker redemption settles via `BANK_TRANSFER_MOCK` or `CASH_PICKUP`, both explicitly manual/demo settlement. Razorpay, Stripe, PayPal, UPI gateways, card gateways, and every other external payment processor are permanently out of scope at every layer of this system for this prototype — the payment category/UI remains fully visible and navigable (Section 14.7), but any attempt to actually pay through a gateway resolves to an explicit "Gateway Not Configured" state, never a silent failure or a fake success.

This document is optimized for direct execution by Claude Code: every requirement is stated as a concrete, testable specification (WHAT/WHERE/WHY/INPUT/OUTPUT/DATABASE/SECURITY/ERRORS/TESTS where applicable), not as a code listing. Sections 1–5 retain the illustrative TypeScript from Version 1.0 as a reference implementation pattern; Sections 6 onward are specification-only by design (see Section 0.3). Section 28 gives the mandatory phased build order (PHASE 0–15), each phase gated on the previous phase's verification and its own Git commit.

---

## Table of Contents

0. Section 0 — Document Control, Verification Status Legend, Audit Summary (+ 0.4 Functional Priority Classification: P0/P1/P2/OUT)
1. Section 1 — Structural Blueprints and Frontend Mapping (+ 1.4 Production Readiness Addendum, mock/seed data retained)
2. Section 2 — Comprehensive Multilingual and UI Dictionary, EN/HI/TA/BN (+ 2.3 i18n Production Requirements)
3. Section 3 — Database Schema, Prisma Format (+ 3.2–3.4 Hardening: new models, constraint audit, migration safety)
4. Section 4 — API Contract Matrix and Engine Algorithms (+ 4.8–4.12 Error envelope, idempotency, rate limits, bug fixes)
5. Section 5 — Postman Suite and Claude Code Desktop Execution Instructions (+ 5.3 Security/load/failure test additions)
6. Section 6 — Authentication and Session Management
7. Section 7 — RBAC and Authorization
8. Section 8 — API Security Framework
9. Section 9 — Threat Model and Mitigations
10. Section 10 — Database Production Hardening
11. Section 11 — Booking and Dispatch: Concurrency, Legal Transitions, Failure Recovery
12. Section 12 — Location and Real-Time Hardening
13. Section 13 — Wallet and Internal Ledger Hardening
14. Section 14 — Payment Model: Manual/Demo Settlement (No Gateway) (+ 14.7 Gateway "Coming Soon" UI State and PaymentService Adapter)
15. Section 15 — Admin Console Production Workflows
16. Section 16 — Document/KYC Storage Security
17. Section 17 — Privacy and Data Handling
18. Section 18 — Notifications Abstraction
19. Section 19 — Frontend Production Readiness
20. Section 20 — Testing Strategy
21. Section 21 — CI/CD Pipeline
22. Section 22 — Monitoring and Observability (prototype scope)
23. Section 23 — Backup and Disaster Recovery (prototype scope)
24. Section 24 — Performance and Scalability Targets (prototype scope)
25. Section 25 — Accessibility and Web Quality
26. Section 26 — Documentation Requirements
27. Section 27 — Claude Code Implementation Rules (Worked Examples)
28. Section 28 — Final Implementation Order (PHASE 0–15, Git-commit-gated)
29. Section 29 — Final Consistency Audit Log (+ 29.5 Hackathon Pivot Audit, 29.6 Acceptance Criteria Checklist)

---

## Section 0: Document Control, Verification Status Legend, Audit Summary

### 0.1 Verification Status Legend

Every requirement in this document is at exactly one of three states. Claude Code must update the status tag on a requirement when its state changes — never mark a requirement PRODUCTION VERIFIED because it was merely coded.

| Tag | Meaning |
|---|---|
| `SPECIFICATION COMPLETE` | The requirement is fully and unambiguously defined in this PRD. No code exists yet. |
| `IMPLEMENTATION REQUIRED` | The requirement is specified and must be built. This is the default state of every requirement in this document as of Version 2.0 — nothing described in this PRD has been implemented in a real repository yet. |
| `PRODUCTION VERIFICATION REQUIRED` | Code exists and passes its specified tests, but has not yet been exercised under real, sustained production conditions. For this prototype pass, this tag is read as "demo-verified" — exercised against the deterministic demo flow (Section 20.2) and deployed to a public prototype URL (Section 21) — not as commercial-scale production traffic verification, which is out of scope (Section 0.4). |

As of this version: **every requirement in this document is `SPECIFICATION COMPLETE` + `IMPLEMENTATION REQUIRED`.** None are `PRODUCTION VERIFICATION REQUIRED` because none have been built. Completing this PRD is not completing the product.

**Scope note (Version 3.0):** this document targets a Smart India Hackathon prototype, not a commercial launch. Section 0.4 classifies every feature area as `P0` (must work for the demo), `P1` (should work, builds credibility), `P2` (nice to have, cut first under time pressure), or `OUT` (explicitly not built). A requirement's `SPECIFICATION COMPLETE`/`IMPLEMENTATION REQUIRED` tag states what the finished spec asks for; its P0–OUT tag in Section 0.4 states whether hackathon time is actually spent building it. Where Sections 22–24 describe enterprise-grade operational depth (multi-region failover, formal RPO/RTO, extensive load testing), those sections are marked as reduced to prototype scope — the full requirement is preserved as a documented future upgrade path, not deleted, per Section 9 point "Remove Only Unnecessary Production Overhead."

### 0.2 Audit Summary (Version 1.0 → 2.0)

This pass audited the full Version 1.0 document (frontend mapping, i18n, database, API/engine, Postman) against the 25-area production checklist (auth, RBAC, booking lifecycle, dispatch, location, wallet, invoices, reviews, credits, notifications, admin, i18n, documents, security, privacy, API contracts, testing, CI/CD, deployment, monitoring, backups, DR, performance, accessibility, SEO, documentation, scalability, failure recovery). Two genuine design defects were found and corrected in place (not rewritten from scratch); see Section 4.12. Everything else in Version 1.0 was valid and is preserved unchanged; gaps were additive.

| Finding class | Count | Where fixed |
|---|---|---|
| Contradictory (logic bug) | 2 | Section 4.12 |
| Unsafe (no mitigation existed) | 9 | Sections 6, 7, 8, 9, 16 |
| Missing (entire capability absent) | 14 | Sections 6, 10, 13, 14, 16–26 |
| Partial (existed but underspecified) | 6 | Sections 3, 4, 11, 12, 18, 19 |
| Ambiguous (ready for two conflicting readings) | 3 | Sections 4, 11 |
| Non-production (mock-only, undeclared) | 1 | Section 11.4 (dispatch loop durability) |

Full itemized list: Section 29.

### 0.3 Why Sections 6–29 Contain No Source Code

Sections 1–5 retain Version 1.0's illustrative TypeScript/Prisma/JSON as a reference implementation pattern, per the instruction to preserve existing content. Sections 6–29, added in this pass, are specification-only: every new requirement is expressed as prose, tables, or interface-shape descriptions (field names and types, not function bodies) so Claude Code implements it directly rather than transcribing supplied code. Where a new requirement modifies code shown in Sections 1–5, this document states the change as a requirement (Section 4.12) rather than reprinting the function.

### 0.4 Functional Priority Classification (P0 / P1 / P2 / OUT)

`SPECIFICATION COMPLETE`. Added in the Version 3.0 hackathon pass. Every feature area in this PRD carries exactly one priority tag below, used by Section 28's phase plan to decide build order under time pressure — P0 is built first and never cut; P2 is the first thing dropped if time runs out; `OUT` is not built at all in this pass but its architecture is documented so it can be added later without a redesign (Section 14.7's adapter boundary is the concrete example).

| Feature | Priority | Type | Acceptance Criteria |
|---|---|---|---|
| Customer/Worker/Admin auth (register, login, JWT, RBAC) | P0 | Core | All three roles register and log in; role-gated routes reject the wrong role (Section 6, 7) |
| Mock/seed data (realistic Indian demo dataset, resettable) | P0 | Core | `prisma db seed` populates customers, workers, admins, services, bookings, reviews, wallet history (Section 1.4, 19.3, 21.5) |
| Service catalog + booking request flow | P0 | Core | Customer selects a service/category and submits a booking that persists to Postgres (Section 4.3) |
| Worker Continuity Dispatch Engine (top-3 + pool) | P0 | Core | A submitted booking reaches `ASSIGNED` via the real dispatch algorithm, not a hardcoded assignment (Section 4.4, 11) |
| Booking lifecycle state machine | P0 | Core | All legal transitions in Section 1.0's table are enforced end to end for one full booking (Section 11.1) |
| Worker accept/start/complete actions | P0 | Core | Worker app moves a booking through `ASSIGNED → IN_PROGRESS → COMPLETED` (Section 1.2, 4.5) |
| Customer live status/tracking updates | P0 | Core | Customer UI reflects booking status changes via Socket.io without a manual refresh (Section 1.1.5, 12) |
| Admin dispatch monitoring + force-assign + verification | P0 | Core | Admin can view active dispatches, verify a worker, and force-assign a stuck booking (Section 15) |
| Reviews and ratings | P1 | Enhancement | Customer submits a review after completion; average rating updates on the worker profile (Section 4.5) |
| Wallet / internal ledger + Feedback Credit | P1 | Enhancement | Worker wallet balance reflects `JOB_PAYOUT`/`FEEDBACK_CREDIT` rows derived by `SUM`, not a stored counter (Section 13) |
| Notifications (in-app) | P1 | Enhancement | `InAppChannel` delivers a notification for at least booking-assigned and booking-completed events (Section 18) |
| Payment category UI with "Coming Soon" gateway state | P1 | Enhancement | Payment option is visible and clickable; clicking resolves to the exact Section 14.7 messaging, never a silent no-op or a fake success (Section 14.7) |
| i18n (EN/HI/TA/BN) | P1 | Enhancement | Section 2's dictionary is wired for all four locales with zero hardcoded strings and zero trailing periods (Section 2.3) |
| Document/KYC upload (worker verification) | P2 | Polish | Worker can upload a document; admin can view/approve it; malware scan stays a stubbed interface (Section 16) |
| Redemption / manual settlement admin workflow | P2 | Polish | Admin can mark a worker redemption `COMPLETED` via `BANK_TRANSFER_MOCK`/`CASH_PICKUP` (Section 14.4) |
| Accessibility polish (full WCAG 2.2 AA audit) | P2 | Polish | Baseline semantic HTML/contrast/keyboard-nav holds (Section 25); a full formal audit is not required for demo day |
| CI/CD pipeline with full staged gates | P2 | Polish | A build-and-test pipeline runs on push; the full staging-promotion ceremony (Section 21.2–21.3) is simplified for a single deployable environment |
| Real payment gateway integration (any provider) | `OUT` | Deferred | Not built. `PaymentService`'s `FutureGatewayAdapter` boundary (Section 14.7) is documented so this can be added later without touching booking/invoice/ledger code |
| Multi-region failover, formal RPO/RTO, enterprise DR | `OUT` | Deferred | Not built. Section 23 documents the reduced prototype-scope backup posture; the full enterprise version is preserved as a documented future upgrade |
| Production-scale load testing and autoscaling | `OUT` | Deferred | Not built. Section 24 keeps latency targets as a design guide; k6/Artillery load runs are not part of this pass |
| Real SMS/email/push notification delivery | `OUT` | Deferred | Not built. Section 18's channel abstraction stays interface-ready but unwired, exactly as Version 2.0 specified |

---

## Section 1: Structural Blueprints and Frontend Mapping

This section maps every screen, modal, and interactive component found in the existing `index.html` / `app.js` frontend (Vue 3 Composition API, `ref`/`computed`, `navigateTo()` for customer/worker views, `setAdminTab()` for the Registrar Console) into four backend dimensions: the visual workflow node that triggers the action, the database mutation it produces, the API payload contract that carries it, and the state machine transition it drives.

### 1.0 Global Booking State Machine

The frontend currently models booking progress with a flat `status` string on the booking object (`Finding`, `Top3Contacted`, `WiderPool`, `Assigned`, `InProgress`, `Completed`, `Cancelled`). The production backend formalizes this into the strict state machine required by the PRD, with two additional terminal-adjacent states (`CONFIRMED`, `SETTLED`) that the mock frontend does not need but the real payment/dispatch engine does.

| Frontend `booking.status` (mock) | Backend `BookingStatus` enum | Meaning |
|---|---|---|
| `Created` / `Finding` | `REQUESTED` | Customer submitted the request; matching engine has not yet run |
| `Top3Contacted` | `DISPATCHING_TOP3` | Top 3 continuity-ranked workers have been offered the job sequentially |
| `WiderPool` | `DISPATCHING_POOL` | No top-3 worker accepted within the response window; offer broadcast to the wider cooperative pool |
| `Assigned` | `ASSIGNED` | A worker accepted the offer via `DispatchLog`; worker is locked to the booking |
| *(implicit, instant in mock)* | `CONFIRMED` | Customer-side confirmation notice sent and acknowledged (auto-confirmed 60s after `ASSIGNED` if the customer does not cancel) |
| `InProgress` | `IN_PROGRESS` | Worker tapped "Start Service" at the job site |
| `Completed` | `COMPLETED` | Worker tapped "Finish Service"; rating modal opens on the customer side |
| *(implicit, immediate in mock)* | `SETTLED` | Invoice finalized, `PaymentTransaction` closed, `FeedbackCredit` distributed to worker wallet |
| `Cancelled` | `CANCELLED` | Cancelled by customer, worker, or system (no acceptance within pool timeout) |

Legal transitions (enforced in the `BookingStateMachine` service, Section 4):

```
REQUESTED        -> DISPATCHING_TOP3, CANCELLED
DISPATCHING_TOP3 -> ASSIGNED, DISPATCHING_POOL, CANCELLED
DISPATCHING_POOL -> ASSIGNED, CANCELLED
ASSIGNED         -> CONFIRMED, CANCELLED
CONFIRMED        -> IN_PROGRESS, CANCELLED
IN_PROGRESS      -> COMPLETED
COMPLETED        -> SETTLED
SETTLED          -> (terminal)
CANCELLED        -> (terminal)
```

---

### 1.1 Customer Journey

#### 1.1.1 Role Selection and Landing

- Visual Workflow Nodes: Landing screen role cards `Get Started as Customer` / `Join as Cooperative Worker` (bound to `setRole('customer' | 'worker')`), stats counters (`statWorkers`, `statBookings`, `statCooperatives`) animated by `triggerStatsAnimation()`
- Database Mutations: Read-only — `SELECT count(*) FROM "User" WHERE role = 'WORKER'`, `SELECT count(*) FROM "Booking" WHERE status = 'SETTLED'`, `SELECT count(*) FROM "Cooperative"`, cached in Redis (`stats:platform`, TTL 300s)
- API Payload Schema: `GET /api/v1/public/stats` → `{ "totalWorkers": number, "completedBookings": number, "activeCooperatives": number }`
- State Machine Transitions: None (pre-auth)

#### 1.1.2 Customer Login / Registration

- Visual Workflow Nodes: `Customer Login` modal (`emailPlaceholder`, `passwordPlaceholder`, `loginButton`), `Customer Registration` modal (`fullName`, email, phone, address, password) triggered from `handleLogin()` / `handleRegister()`
- Database Mutations: `INSERT INTO "User" (id, role, fullName, email, phone, passwordHash, createdAt)` inside a Prisma transaction that also creates the linked `CustomerProfile` row (`defaultAddress`, `defaultLocation` PostGIS `Point`); login path issues `SELECT` + bcrypt compare, no mutation except `lastLoginAt` update
- API Payload Schema:
  - `POST /api/v1/auth/customer/register` → req `{ "fullName": string, "email": string, "phone": string, "password": string, "address": string, "lat": number, "lng": number }` → res `{ "userId": string, "token": string, "refreshToken": string }`
  - `POST /api/v1/auth/customer/login` → req `{ "identifier": string, "password": string }` → res `{ "userId": string, "token": string, "refreshToken": string, "profile": { "fullName": string, "address": string } }`
- State Machine Transitions: None (account-level, not booking-level)

#### 1.1.3 Service Catalog (`servicesTitle` / dashboard grid)

- Visual Workflow Nodes: Service category cards (`plumbing`, `electrical`, `carpentry`, `painting`, `caregiving`, `gardening`, `cleaning`, `domesticHelp`) triggering `selectService(serviceId)`
- Database Mutations: `SELECT * FROM "ServiceCategory" WHERE isEnabled = true ORDER BY sortOrder` (Redis-cached, key `services:catalog:{lang}`, invalidated on admin `PATCH /services`)
- API Payload Schema: `GET /api/v1/services` → res `[{ "id": "plumbing", "translationKey": "plumbing", "baseRate": 250, "hourlyRate": 150, "icon": "wrench", "isEnabled": true }]`
- State Machine Transitions: None

#### 1.1.4 Create Service Request (`requestServiceTitle`)

- Visual Workflow Nodes: Request form (`locationLabel`, `descLabel`, `datetimeLabel`, `urgencyLabel` with `urgencyNormal` / `urgencyUrgent` radio group, live `paymentEstimate`), submit button `submitRequest` bound to `handleRequestSubmit()`
- Database Mutations: Single Prisma transaction: `INSERT INTO "Booking"` (`customerId`, `serviceCategoryId`, `type = ON_DEMAND | SCHEDULED`, `customerLocation` PostGIS `Point(lng, lat)`, `description`, `scheduledAt`, `urgency`, `baseCharge`, `hourlyRate`, `status = REQUESTED`, `lockExpiresAt = null`) plus `INSERT INTO "AuditLog"` (`action = BOOKING_CREATED`); the geospatial column is written with `ST_SetSRID(ST_MakePoint($lng, $lat), 4326)` and indexed with a `GIST` index for the dispatch scan
- API Payload Schema: `POST /api/v1/bookings/request` → req `{ "serviceCategoryId": "plumbing", "location": { "address": string, "lat": number, "lng": number }, "description": string, "scheduledAt": "ISO8601 or null for on-demand", "urgency": "NORMAL" | "URGENT" }` (validated: `description` 10–500 chars, `lat`/`lng` within India bounding box, `scheduledAt` future or null) → res `{ "bookingId": string, "status": "REQUESTED", "estimatedTotal": number }`
- State Machine Transitions: `(none) -> REQUESTED`, immediately followed server-side by `REQUESTED -> DISPATCHING_TOP3` once the dispatch job is enqueued

#### 1.1.5 Matching Screens — Worker Continuity Engine (`findingWorkersTitle`, `topWorkersTitle`, `widerPoolTitle`)

- Visual Workflow Nodes: "Finding workers" loader, "Top 3 Suitable Cooperative Workers Contacted" list (`nameLabel`, `ratingLabel`, `distanceLabel`, `cooperativeName`, `statusLabel` cycling through `statusWaiting` → `statusAccepted` / `statusDeclined` / `statusTimeout`), automatic fallback to "Wider Cooperative Pool Activated" panel — driven client-side today by `simulateWorkerAcceptancePathA()` / `simulateNoResponsePathB()` / `simulatePoolWorkerAcceptance()`, server-driven in production via Socket.io room `booking:{bookingId}`
- Database Mutations: One `INSERT INTO "DispatchLog"` row per offer (`bookingId`, `workerId`, `attemptNumber` 1–3 or `POOL`, `offeredAt`, `respondedAt`, `outcome`); on acceptance, a single Prisma transaction updates `Booking.status`, `Booking.assignedWorkerId`, `Booking.lockExpiresAt = null`, and `WorkerProfile.availabilityStatus = ON_JOB`
- API Payload Schema: Server push over Socket.io event `dispatch:update` → `{ "bookingId": string, "phase": "TOP3" | "POOL", "candidates": [{ "workerId": string, "name": string, "avatarUrl": string, "rating": number, "distanceKm": number, "experienceYears": number, "cooperativeName": string, "offerStatus": "WAITING" | "ACCEPTED" | "DECLINED" | "TIMEOUT" }] }`; worker-side response endpoint `POST /api/v1/dispatch/:dispatchLogId/respond` → req `{ "response": "ACCEPT" | "DECLINE" }` → res `{ "outcome": "ACCEPTED" | "DECLINED" | "LOCK_LOST" }`
- State Machine Transitions: `REQUESTED -> DISPATCHING_TOP3 -> ASSIGNED` (happy path) or `DISPATCHING_TOP3 -> DISPATCHING_POOL -> ASSIGNED` (timeout/decline fallback) or `DISPATCHING_POOL -> CANCELLED` (pool exhausted, no acceptance)

#### 1.1.6 Booking Confirmed and Service Status Tracker (`bookingConfirmedTitle`, `serviceStatusTitle`)

- Visual Workflow Nodes: Confirmation card (`assignedWorker`, `contactNumber`, `bookingDetails`), tracker stages (`stageCreated` → `stageFinding` → `stageTop3` → `stageWaiting` → `stageWider` → `stageAssigned` → `stageProgress` → `stageCompleted`), `completeJobButton`
- Database Mutations: `UPDATE "Booking" SET status = 'CONFIRMED', confirmedAt = now()`; worker start/finish actions update `status = 'IN_PROGRESS' / 'COMPLETED'` with `startedAt` / `completedAt` timestamps, each wrapped in its own short Prisma transaction with an `AuditLog` row
- API Payload Schema: `GET /api/v1/bookings/:id` → res `{ "id": string, "status": string, "worker": { "id": string, "name": string, "phone": string, "avatarUrl": string }, "timeline": [{ "stage": string, "at": "ISO8601 | null" }] }`; `PATCH /api/v1/bookings/:id/start` (worker) and `PATCH /api/v1/bookings/:id/complete` (worker) — both JWT Provider guarded and validated against `assignedWorkerId === req.user.id`
- State Machine Transitions: `ASSIGNED -> CONFIRMED -> IN_PROGRESS -> COMPLETED`

#### 1.1.7 My Bookings, Rating and Review (`myBookingsTitle`, `actionRate`, `rateTitle`)

- Visual Workflow Nodes: Bookings history list, `Rate & Review` action opening the rating modal (`ratingScore` 1–5 stars, `reviewPlaceholder`), `submitReview` → `submitRating()`
- Database Mutations: Prisma transaction: `INSERT INTO "Review"` (`bookingId`, `customerId`, `workerId`, `punctuality`, `quality`, `professionalism`, `communication`, `overallScore`, `writtenFeedback`) then `UPDATE "WorkerProfile" SET ratingAverage = (recomputed), ratingCount = ratingCount + 1`; a 5-star review with `overallScore >= 4.5` triggers `INSERT INTO "CreditTransaction"` funding the `FeedbackCredit` engine (Section 4.5)
- API Payload Schema: `POST /api/v1/bookings/:id/review` → req `{ "punctuality": 1-5, "quality": 1-5, "professionalism": 1-5, "communication": 1-5, "writtenFeedback": string }` → res `{ "reviewId": string, "overallScore": number, "creditIssued": number }`
- State Machine Transitions: `COMPLETED -> SETTLED` (review submission is the trigger that finalizes settlement in the mock-payment model, since there is no external payment gateway to wait on)

---

### 1.2 Worker Journey

#### 1.2.1 Worker Login / Registration (`workerLoginTitle`, `workerRegisterTitle`)

- Visual Workflow Nodes: Registration form fields `cooperativeLabel`, `skillLabel`, `experienceLabel`, identity upload, submitted via `handleRegister()` with `role = 'worker'`
- Database Mutations: Prisma transaction: `INSERT INTO "User"` (`role = WORKER`) → `INSERT INTO "WorkerProfile"` (`cooperativeId`, `verificationStatus = PENDING`, `serviceAreaRadiusKm`, `homeLocation` PostGIS `Point`) → `INSERT INTO "WorkerSkill"` (`skillCategoryId`, `proficiencyLevel = BASIC`, `verificationStatus = PENDING`)
- API Payload Schema: `POST /api/v1/auth/worker/register` → req `{ "fullName": string, "email": string, "phone": string, "password": string, "cooperativeId": string, "primarySkillId": string, "experienceYears": number, "homeLocation": { "lat": number, "lng": number, "address": string }, "serviceAreaRadiusKm": number }` → res `{ "userId": string, "workerProfileId": string, "verificationStatus": "PENDING" }`
- State Machine Transitions: `WorkerProfile.verificationStatus`: `(none) -> PENDING` (see 1.3.6 for admin approval flow)

#### 1.2.2 Worker Dashboard Home (`workerDashboardTitle`, `activeJobTitle`, `incomingTitle`)

- Visual Workflow Nodes: `availabilityLabel` toggle (`available` / `busy`), Active Service Job card, Incoming Job Requests list with `btnAccept` / `btnReject`
- Database Mutations: Toggle → `UPDATE "WorkerProfile" SET availabilityStatus = 'AVAILABLE' | 'OFF_DUTY'`; accept → the atomic Redis-locked acceptance flow described in Section 4.4; reject → `UPDATE "DispatchLog" SET outcome = 'DECLINED', respondedAt = now() WHERE id = :dispatchLogId`
- API Payload Schema: `PATCH /api/v1/workers/me/availability` → req `{ "status": "AVAILABLE" | "OFF_DUTY" }` → res `{ "status": string, "updatedAt": "ISO8601" }`; `GET /api/v1/workers/me/incoming` → res `[{ "dispatchLogId": string, "bookingId": string, "serviceCategory": string, "customerAreaLabel": string, "distanceKm": number, "estimatedTotal": number, "offerExpiresAt": "ISO8601" }]`
- State Machine Transitions: `WorkerProfile.availabilityStatus`: `AVAILABLE <-> OFF_DUTY`, and `AVAILABLE -> ON_JOB` on acceptance

#### 1.2.3 My Orders / Job History (`jobHistoryTitle`)

- Visual Workflow Nodes: "My Orders Ledger" tab, per-row `startJobBtn` / `completeJobBtn` (`workerStartJob()`, `workerCompleteJob()`)
- Database Mutations: See 1.1.6 — same `IN_PROGRESS` / `COMPLETED` transitions, executed from the worker's authenticated session
- API Payload Schema: `GET /api/v1/workers/me/bookings?status=&page=&pageSize=` → res paginated list of booking summaries
- State Machine Transitions: `CONFIRMED -> IN_PROGRESS -> COMPLETED`

#### 1.2.4 Earnings and Wallet (`earningsTitle`, mock: `handleRedeem`, `redemptionHistory`)

- Visual Workflow Nodes: "Cooperative Earnings" panel showing wallet balance, transaction list (`TXN-###`, `COMPLETED` / `PROCESSING`), a redeem-to-bank action
- Database Mutations: Balance is derived, never stored as a mutable counter: `SUM(CreditTransaction.amount WHERE type IN (JOB_PAYOUT, FEEDBACK_CREDIT)) - SUM(CreditTransaction.amount WHERE type = REDEMPTION)`; redemption inserts `INSERT INTO "CreditTransaction" (type = 'REDEMPTION', amount, status = 'PROCESSING')` inside a Prisma transaction guarded by `SELECT ... FOR UPDATE` on the worker's ledger to prevent double-redeem races
- API Payload Schema: `GET /api/v1/workers/me/wallet` → res `{ "availableBalance": number, "pendingBalance": number, "transactions": [{ "id": string, "type": string, "amount": number, "status": string, "createdAt": "ISO8601" }] }`; `POST /api/v1/workers/me/wallet/redeem` → req `{ "amount": number, "payoutMethod": "BANK_TRANSFER_MOCK" | "CASH_PICKUP" }` → res `{ "transactionId": string, "status": "PROCESSING" }`
- State Machine Transitions: `CreditTransaction.status`: `PROCESSING -> COMPLETED | FAILED`

#### 1.2.5 Incentive Programs (`incentives` tab)

- Visual Workflow Nodes: Incentive cards with `progress` / `target`, `expiry`, `status` (`PENDING`, `COMPLETED`, `EXPIRED`), detail modal
- Database Mutations: `SELECT` against `WorkerIncentiveProgress` (materialized view over completed-job counts per rolling window); on `progress >= target` a scheduled job inserts `INSERT INTO "CreditTransaction" (type = 'INCENTIVE_BONUS')`
- API Payload Schema: `GET /api/v1/workers/me/incentives` → res `[{ "id": string, "title": string, "reward": number, "reason": string, "progress": number, "target": number, "expiry": "ISO8601", "status": "PENDING" | "COMPLETED" | "EXPIRED" }]`
- State Machine Transitions: `Incentive.status`: `PENDING -> COMPLETED` or `PENDING -> EXPIRED` (cron at `expiry`)

#### 1.2.6 Map and High-Demand Areas (`map` tab)

- Visual Workflow Nodes: "Location & High-Demand Areas" panel — reuses the same live map primitives as the admin Live Worker Operations screen, scoped to the logged-in worker's cooperative and skill
- Database Mutations: Read-only PostGIS aggregation: `SELECT ST_ClusterKMeans(...)` over recent `REQUESTED` bookings within the worker's `serviceAreaRadiusKm`
- API Payload Schema: `GET /api/v1/workers/me/demand-heatmap` → res `[{ "cellId": string, "centroid": { "lat": number, "lng": number }, "openRequests": number, "avgUrgencyScore": number }]`
- State Machine Transitions: None

#### 1.2.7 Worker Welfare Monitor (`welfare` tab)

- Visual Workflow Nodes: Welfare dashboard (continuous working-hours alerts, rest reminders, grievance shortcut)
- Database Mutations: Read-only aggregation over `Booking.startedAt` / `completedAt` per worker per rolling 24h window, computed in a scheduled worker (no persistent write unless a `WelfareAlert` threshold is crossed → `INSERT INTO "AuditLog" (action = 'WELFARE_ALERT_RAISED')`)
- API Payload Schema: `GET /api/v1/workers/me/welfare` → res `{ "hoursWorkedToday": number, "hoursWorkedThisWeek": number, "consecutiveJobStreak": number, "restRecommended": boolean }`
- State Machine Transitions: None

#### 1.2.8 My Cooperative Society (`cooperative` tab)

- Visual Workflow Nodes: Cooperative profile card (name, member count, founded year), member roster preview
- Database Mutations: Read-only `SELECT * FROM "Cooperative" WHERE id = :cooperativeId`
- API Payload Schema: `GET /api/v1/cooperatives/:id` → res `{ "id": string, "name": string, "location": string, "members": number, "founded": number }`
- State Machine Transitions: None

#### 1.2.9 Profile, Help and Support, Notifications, Settings

- Visual Workflow Nodes: Profile edit form, Help & Support contact/FAQ list, Member Notifications feed (`markNotificationRead`, `markAllNotificationsRead`), Interface Settings (theme, language)
- Database Mutations: `UPDATE "User"` (profile fields); `UPDATE "Notification" SET isRead = true WHERE id = :id / userId = :userId`; settings are stored client-side (`localStorage` today) and mirrored server-side in `UserPreference` for cross-device sync
- API Payload Schema: `PATCH /api/v1/users/me` → req `{ "fullName"?: string, "phone"?: string, "avatarUrl"?: string }`; `GET /api/v1/notifications` → res paginated `Notification[]`; `PATCH /api/v1/notifications/:id/read`; `PATCH /api/v1/notifications/read-all`; `PATCH /api/v1/users/me/preferences` → req `{ "theme": "LIGHT" | "DARK", "language": "en" | "hi" | "ta" | "bn" }`
- State Machine Transitions: None

---

### 1.3 Admin / Registrar Console

#### 1.3.1 Registrar Login and Dashboard Overview

- Visual Workflow Nodes: `adminLoginTitle` form; "Registrar Dashboard Overview" with recent dispatch events feed and worker availability/operations summary
- Database Mutations: Read-only aggregates: total workers, active/available workers, registered customers, active bookings, completed bookings, registered cooperatives (matches `totalWorkers`, `availableWorkers`, `totalCustomers`, `activeBookings`, `completedBookings`, `totalCooperatives` translation keys)
- API Payload Schema: `GET /api/v1/admin/dashboard/summary` → res `{ "totalWorkers": number, "availableWorkers": number, "totalCustomers": number, "activeBookings": number, "completedBookings": number, "totalCooperatives": number, "recentDispatchEvents": [{ "bookingId": string, "event": string, "at": "ISO8601" }] }`
- State Machine Transitions: None

#### 1.3.2 Service Dispatch Requests (`requests` tab) and Request Detail Modal

- Visual Workflow Nodes: "Service Dispatch Requests" table filterable by `requestFilterStatus`, row click → `openRequestDetails(request)` modal
- Database Mutations: Read-only list + join to `DispatchLog`; manual override action (`Force Reassign`) performs the same atomic-lock acceptance transaction as the automated engine but with `attemptNumber = 'ADMIN_OVERRIDE'`
- API Payload Schema: `GET /api/v1/admin/bookings?status=&page=` and `GET /api/v1/admin/bookings/:id/dispatch-log` → res `DispatchLog[]`; `POST /api/v1/admin/bookings/:id/force-assign` (JWT Admin) → req `{ "workerId": string, "reason": string }`
- State Machine Transitions: Any non-terminal status `-> ASSIGNED` (admin override) or `-> CANCELLED` (admin cancel)

#### 1.3.3 Worker Continuity Dispatch Monitor (`monitoring` tab)

- Visual Workflow Nodes: "Worker Continuity Dispatch Monitor" — live view of `activeReq` showing per-candidate offer countdown, mirrors the customer-side matching screen but for oversight
- Database Mutations: Read-only, subscribes to the same Socket.io `dispatch:update` stream consumed in 1.1.5
- API Payload Schema: `GET /api/v1/admin/dispatch/active` → res list of in-flight `DISPATCHING_TOP3` / `DISPATCHING_POOL` bookings with live candidate arrays
- State Machine Transitions: None (observation only)

#### 1.3.4 Live Worker Operations Map (`liveWorkers` tab)

- Visual Workflow Nodes: Map canvas with worker pins colored by status (`AVAILABLE`, `ON JOB`, `TRAVELLING`, `OFF DUTY`), filters `liveAdminFilterStatus` / `liveAdminFilterJobStatus`, `zoomIn` / `zoomOut` / `fitAll`, `focusWorker(w)` drawer, alert flag (e.g., "Emergency alert / job issue")
- Database Mutations: Read-only PostGIS query `SELECT id, name, status, ST_X(currentLocation), ST_Y(currentLocation), currentBookingId FROM "WorkerProfile" WHERE availabilityStatus != 'OFF_DUTY'`; worker location pings write `UPDATE "WorkerProfile" SET currentLocation = ST_SetSRID(ST_MakePoint($lng,$lat),4326), lastLocationAt = now()` (rate-limited to 1 write per 10s per worker via Redis debounce key `loc:debounce:{workerId}`)
- API Payload Schema: `GET /api/v1/admin/live/workers` (initial snapshot) + Socket.io event `worker:location` → `{ "workerId": string, "lat": number, "lng": number, "status": "AVAILABLE" | "ON_JOB" | "TRAVELLING" | "OFF_DUTY", "bookingId": string | null, "progressPct": number | null, "alert": boolean, "alertReason": string | null }`
- State Machine Transitions: `WorkerProfile.availabilityStatus`: `AVAILABLE -> TRAVELLING -> ON_JOB -> AVAILABLE`

#### 1.3.5 Cooperative Workers Directory (`workers` tab) and Worker Profile Modal

- Visual Workflow Nodes: Directory table, `openWorkerDetails(worker)` modal showing identity, skills, certifications, verification status, `Approve` / `Reject` / `Verify` actions with `RejectionReason` input
- Database Mutations: Prisma transaction on approve: `UPDATE "WorkerProfile" SET verificationStatus = 'APPROVED', approvedAt = now(), approvedByAdminId = :adminId` + `INSERT INTO "AuditLog"`; on reject: `UPDATE "WorkerProfile" SET verificationStatus = 'REJECTED', rejectionReason = :reason`; skill/certification verification updates `WorkerSkill.verificationStatus` independently
- API Payload Schema: `GET /api/v1/admin/workers?verificationStatus=&page=`; `PATCH /api/v1/admin/workers/:id/verify` (JWT Admin) → req `{ "decision": "APPROVED" | "REJECTED", "rejectionReason"?: string }` → res `{ "workerId": string, "verificationStatus": string }`; `PATCH /api/v1/admin/workers/:id/skills/:skillId/verify` → req `{ "verificationStatus": "APPROVED" | "REJECTED", "proficiencyLevel"?: "BASIC" | "INTERMEDIATE" | "ADVANCED" }`
- State Machine Transitions: `WorkerProfile.verificationStatus`: `PENDING -> APPROVED | REJECTED`; `WorkerSkill.verificationStatus`: `PENDING -> APPROVED | REJECTED`

#### 1.3.6 Registered Customer Accounts (`customers` tab) and Customer Modal

- Visual Workflow Nodes: Directory table filterable by `customerFilterStatus`, `openCustomerDetails(customer)` modal, enable/suspend toggle
- Database Mutations: `UPDATE "User" SET accountStatus = 'ACTIVE' | 'SUSPENDED' WHERE id = :customerId`
- API Payload Schema: `GET /api/v1/admin/customers?status=&page=`; `PATCH /api/v1/admin/customers/:id/status` → req `{ "accountStatus": "ACTIVE" | "SUSPENDED" }`
- State Machine Transitions: `User.accountStatus`: `ACTIVE <-> SUSPENDED`

#### 1.3.7 Labour Cooperative Societies (`cooperatives` tab) and Society Modal

- Visual Workflow Nodes: Directory table, `openCooperativeDetails(coop)` modal (member roster, active/completed job counts)
- Database Mutations: `INSERT` / `UPDATE "Cooperative"` for onboarding a new society; read aggregation joins `WorkerProfile.cooperativeId`
- API Payload Schema: `GET /api/v1/admin/cooperatives`; `POST /api/v1/admin/cooperatives` → req `{ "name": string, "location": string, "registrationNumber": string }`; `GET /api/v1/admin/cooperatives/:id` → res includes `activeJobs`, `completedJobs`
- State Machine Transitions: None

#### 1.3.8 Platform Booking Ledger (`bookings` tab) and Invoice Modal

- Visual Workflow Nodes: "Platform Booking Ledger" table filterable by `bookingFilterStatus`, `openBookingDetails(booking)` opens the "Booking Invoice" modal (base charge, platform fee, total, payment method, payment status)
- Database Mutations: Read-only join of `Booking` + `Invoice` + `PaymentTransaction`
- API Payload Schema: `GET /api/v1/admin/bookings/ledger?status=&page=`; `GET /api/v1/admin/bookings/:id/invoice` → res `{ "invoiceId": string, "baseCharge": number, "platformFee": number, "totalAmount": number, "paymentMethod": "CASH" | "DIRECT_PAY", "paymentStatus": "PENDING" | "PAID" | "REFUNDED" }`
- State Machine Transitions: `PaymentTransaction.paymentStatus`: `PENDING -> PAID | REFUNDED`

#### 1.3.9 Service Sectors Management (`services` tab) and Add/Edit Service Modals

- Visual Workflow Nodes: "Add New Service Category" modal (`newServiceData`: id, translationKey, baseRate, hourlyRate, icon, status), "Edit Service Rates" modal (`editingServiceData`), `toggleServiceStatus(svcId)` (`Enable` / `Disable`)
- Database Mutations: `INSERT INTO "ServiceCategory"` (`addService()`), `UPDATE "ServiceCategory" SET baseRate, hourlyRate` (`editService()`), `UPDATE "ServiceCategory" SET isEnabled = NOT isEnabled` (`toggleServiceStatus()`) — every write invalidates the Redis `services:catalog:*` cache keys
- API Payload Schema: `POST /api/v1/admin/services` → req `{ "id": string, "translationKey": string, "baseRate": number, "hourlyRate": number, "icon": string }`; `PATCH /api/v1/admin/services/:id` → req `{ "baseRate"?: number, "hourlyRate"?: number, "isEnabled"?: boolean }`
- State Machine Transitions: `ServiceCategory.isEnabled`: `true <-> false`

#### 1.3.10 Registrar Notification Center and Performance Reports

- Visual Workflow Nodes: "Registrar Notification Center" broadcast composer, "Performance Reports & Analytics" charts (top performing service sectors, cooperative rating distribution)
- Database Mutations: `INSERT INTO "Notification"` fan-out (one row per targeted `userId`, or a `BroadcastNotification` row with an audience filter for large fan-outs processed by a queue worker); reports are read-only materialized aggregates refreshed hourly by a scheduled job
- API Payload Schema: `POST /api/v1/admin/notifications/broadcast` → req `{ "audience": "ALL_WORKERS" | "ALL_CUSTOMERS" | "COOPERATIVE:{id}", "title": string, "body": string }`; `GET /api/v1/admin/reports/top-sectors`; `GET /api/v1/admin/reports/rating-distribution`
- State Machine Transitions: None

#### 1.3.11 Federation Admin Settings (`settings` tab)

- Visual Workflow Nodes: Platform-wide configuration form (commission rate, dispatch timeout seconds, pool size)
- Database Mutations: `UPDATE "PlatformConfig" SET commissionPercent, top3TimeoutSeconds, poolTimeoutSeconds WHERE id = 1` (singleton row), read through a 60s Redis cache
- API Payload Schema: `GET /api/v1/admin/config`; `PATCH /api/v1/admin/config` → req `{ "commissionPercent"?: number, "top3TimeoutSeconds"?: number, "poolTimeoutSeconds"?: number }`
- State Machine Transitions: None

### 1.4 Production Readiness Addendum

`IMPLEMENTATION REQUIRED`. Every screen enumerated in 1.1–1.3 must ship with all applicable states below before it is considered production-ready. This table is normative: a screen missing a row it applies to is an open defect, not a style preference.

| State | Requirement |
|---|---|
| Loading | Skeleton or spinner within 100ms of navigation; no blank white frame. Applies to every screen that fetches data (all except pure static content). |
| Success | Normal populated render — the only state Version 1.0 fully described. |
| Empty | A distinct empty-state message (translated key, not hardcoded English) for zero-result lists: `noBookings`, `noIncoming`, `noNotifications` already exist as keys; add equivalents for workers directory, customers directory, cooperatives directory, bookings ledger, and dispatch-active lists in the Admin console. |
| Error | A distinct error state (translated, not a raw stack trace or raw API error body — see Section 8.5) with a human-readable message and a retry affordance, shown when the API call fails or times out. |
| Retry | Every Error state must offer a retry action that re-issues the same request; list screens additionally support pull-to-refresh or a manual refresh control. |
| Offline | Screens that depend on Socket.io (matching screen 1.1.5, Live Worker Operations 1.3.4, Continuity Monitor 1.3.3) must detect socket disconnect and show a non-blocking "reconnecting" indicator rather than silently going stale — see Section 12.5 for reconnect/missed-event behavior. |
| Validation | Every form (login, register, request form, review, admin service/cooperative/config forms) validates client-side against the same rules enforced server-side by Zod (Section 8.1) and surfaces field-level errors, not just a toast. |
| Responsive | All screens usable at a 360px-wide viewport (the frontend already uses Tailwind responsive classes extensively; this is a regression check, not new work). |
| Accessibility | See Section 25 for the full requirement; every screen listed here is in scope. |

**Mock/seed data retention rule (`IMPLEMENTATION REQUIRED`, reversed from Version 2.0):** for this hackathon prototype, mock/seed data is a required deliverable, not a removal target. Every screen's data comes from the real API endpoints defined in Section 4.2, backed by a real Postgres database — but that database is populated with `mockData.js`'s content (cooperatives, services, sample workers/customers/bookings, reviews) via the backend seed script (`prisma/seed.ts`, Section 19.3, 21.5). This is the "REAL DATABASE + REAL CORE APIs + REAL CORE BUSINESS LOGIC + MOCK/SEED DATA" model: the frontend never reads `window.mockData.*` directly (that would be a frontend-only fake demo), but the API it calls is answering from genuine, seeded rows. `mockData.js` itself stays in the repository as the seed script's input and as living documentation of the demo dataset's shape; it is not deleted. An admin-only `POST /api/v1/admin/demo/reset` endpoint (Section 15.9) re-runs the seed script against the current database so the demo dataset can be restored to a known-good state between demo runs. The client-side simulation functions `simulateWorkerAcceptancePathA`, `simulateNoResponsePathB`, `simulatePoolWorkerAcceptance`, and the local `setTimeout`-based matching timer in `handleRequestSubmit` are still replaced by the real `dispatch:update` Socket.io stream (Section 1.1.5, Section 11) — dispatch is real, engine-driven matching against seeded worker rows, not a client-side timer fake; only the *matching mechanism* is real, not a claim that mock data is absent.

**Frontend/backend call mapping rule (`IMPLEMENTATION REQUIRED`):** every `fetch`/API call added to `app.js` during implementation must correspond to exactly one row in the Section 4.2 route matrix. A call to a path not in that matrix is a spec gap — stop and add the endpoint to Section 4.2 before implementing the frontend call, do not invent an undocumented endpoint.

---

## Section 2: Comprehensive Multilingual and UI Dictionary (EN, HI, TA, BN)

This dictionary extends the existing `window.translations` object (which today only covers `en`, `hi`, `ta` for the customer-facing screens) in two directions: it fills in every hardcoded English string discovered in `index.html` for the Worker Dashboard sub-screens (earnings, incentives, map, welfare, cooperative, support, notifications, settings) and the full Registrar Console, and it adds a complete fourth locale, `bn` (Bengali), from scratch. Every value in every language has had its trailing full stop removed, per the strict no-trailing-period formatting rule — this includes sentence-length description strings that carried a period in the original file (for example `noBookings`, `reviewSuccess`, `why1Desc`).

The object below is a drop-in replacement for `translations.js`: same top-level shape (`window.translations.{en,hi,ta,bn}`), same key names for every pre-existing key, so no call site in `app.js` needs to change. New keys are additive only.

### 2.1 Quick-Reference Table — Requested Menu, Action and Status Set

| Key | EN | HI | TA | BN |
|---|---|---|---|---|
| `navDashboard` | Dashboard | डैशबोर्ड | டாஷ்போர்டு | ড্যাশবোর্ড |
| `navMyBookings` | My Bookings | मेरी बुकिंग | எனது முன்பதிவுகள் | আমার বুকিং |
| `navAvailableRequests` | Available Requests | उपलब्ध अनुरोध | கிடைக்கும் கோரிக்கைகள் | উপলব্ধ অনুরোধ |
| `navEarnings` | Earnings | कमाई | வருமானம் | আয় |
| `navIncentives` | Incentives | प्रोत्साहन | ஊக்கத்தொகைகள் | প্রণোদনা |
| `navMap` | Map & Demand | मानचित्र और मांग | வரைபடம் & தேவை | মানচিত্র ও চাহিদা |
| `navWelfare` | Welfare | कल्याण | நலன் | কল্যাণ |
| `navCooperative` | Cooperative | सहकारी समिति | கூட்டுறவு | সমবায় |
| `navProfile` | Profile | प्रोफ़ाइल | சுயவிவரம் | প্রোফাইল |
| `navSupport` | Help & Support | सहायता और समर्थन | உதவி & ஆதரவு | সহায়তা ও সমর্থন |
| `navNotifications` | Notifications | सूचनाएं | அறிவிப்புகள் | বিজ্ঞপ্তি |
| `navSettings` | Settings | सेटिंग्स | அமைப்புகள் | সেটিংস |
| `platformAdmin` | Platform Admin | प्लेटफ़ॉर्म प्रशासक | தள நிர்வாகி | প্ল্যাটফর্ম অ্যাডমিন |
| `registrarConsole` | Registrar Console | रजिस्ट्रार कंसोल | பதிவாளர் கன்சோல் | রেজিস্ট্রার কনসোল |
| `actionBookService` | Book Service | सेवा बुक करें | சேவையை பதிவு செய் | সার্ভিস বুক করুন |
| `actionAccept` | Accept | स्वीकार करें | ஏற்றுக்கொள் | গ্রহণ করুন |
| `actionReject` | Reject | अस्वीकार करें | நிராகரி | প্রত্যাখ্যান করুন |
| `actionEditPrice` | Edit Price | कीमत संपादित करें | விலையை திருத்து | মূল্য সম্পাদনা করুন |
| `actionEnable` | Enable | सक्षम करें | இயக்கு | সক্রিয় করুন |
| `actionApprove` | Approve | स्वीकृत करें | அங்கீகரி | অনুমোদন করুন |
| `actionVerify` | Verify | सत्यापित करें | சரிபார் | যাচাই করুন |
| `statusOffDuty` | Off Duty | ड्यूटी पर नहीं | பணியில் இல்லை | ডিউটিতে নেই |
| `statusOnDuty` | On Duty | ड्यूटी पर | பணியில் | ডিউটিতে |
| `statusCompleted` | Completed | पूर्ण | முடிந்தது | সম্পন্ন |
| `statusAssigned` | Assigned | आवंटित | ஒதுக்கப்பட்டது | নির্ধারিত |
| `statusInProgress` | In Progress | प्रगति पर | செயல்பாட்டில் | চলমান |
| `statusCancelled` | Cancelled | रद्द | ரத்து செய்யப்பட்டது | বাতিল |

### 2.2 Complete `translations.js` Replacement

```javascript
window.translations = {
  en: {
    // Global / App Shell
    appName: "Worksetu",
    tagline: "Cooperative Gig Services Platform for Households & Communities",
    roleSelection: "Select Role",
    customer: "Customer",
    worker: "Cooperative Worker",
    admin: "Platform Administrator",
    login: "Log In",
    logout: "Log Out",
    register: "Register",
    home: "Home",
    dashboard: "Dashboard",
    myBookings: "My Bookings",
    services: "Services",
    profile: "Profile",
    activeJob: "Active Job",
    incomingRequests: "Incoming Requests",
    jobHistory: "Job History",
    theme: "Theme",
    language: "Language",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    edit: "Edit",
    delete: "Delete",
    search: "Search",
    filter: "Filter",
    all: "All",
    viewDetails: "View Details",
    viewAll: "View All",
    loading: "Loading",
    noDataFound: "No data found",

    // Landing Page
    landingTitle: "Empowering Cooperative Workers, Serving Communities",
    landingSubtitle: "Connect with skilled, verified, and reliable professionals from local labour cooperatives for household services",
    getStarted: "Get Started as Customer",
    joinAsWorker: "Join as Cooperative Worker",
    whyChooseUs: "Why Choose Worksetu?",
    why1Title: "Cooperative Backed",
    why1Desc: "Every worker is a certified member of a registered labour cooperative society",
    why2Title: "Worker Continuity",
    why2Desc: "Our smart dispatch system prioritizes familiar local workers for reliable ongoing service",
    why3Title: "Fair Earnings",
    why3Desc: "Cooperatives ensure fair pay and social security benefits for all workers",
    statsTitle: "Platform Impact",
    statWorkers: "Skilled Workers",
    statBookings: "Completed Jobs",
    statCooperatives: "Active Cooperatives",

    // Auth Screens
    customerLoginTitle: "Customer Login",
    workerLoginTitle: "Worker Login",
    adminLoginTitle: "Admin Login",
    emailPlaceholder: "Enter email or phone number",
    passwordPlaceholder: "Enter password",
    loginButton: "Sign In",
    noAccount: "Don't have an account?",
    registerLink: "Register here",
    alreadyHaveAccount: "Already have an account?",
    loginLink: "Login here",
    fullName: "Full Name",
    cooperativeLabel: "Select Cooperative",
    skillLabel: "Select Primary Skill",
    experienceLabel: "Years of Experience",
    customerRegisterTitle: "Customer Registration",
    workerRegisterTitle: "Worker Registration",

    // Services
    servicesTitle: "Book a Service",
    servicesSubtitle: "Choose a category below to find skilled cooperative workers",
    plumbing: "Plumbing",
    electrical: "Electrical Services",
    carpentry: "Carpentry",
    painting: "Painting",
    caregiving: "Domestic Caregiving",
    gardening: "Gardening & Landscaping",
    cleaning: "House Cleaning",
    domesticHelp: "Domestic Help & Cooking",
    actionBookService: "Book Service",

    // Service Request Form
    requestServiceTitle: "Create Service Request",
    locationLabel: "Service Location / Address",
    locationPlaceholder: "Enter your address",
    descLabel: "Describe your requirements",
    descPlaceholder: "Describe the work details, e.g., 'Leaking kitchen tap and pipe needs replacement'",
    datetimeLabel: "Scheduled Date & Time",
    urgencyLabel: "Urgency Level",
    urgencyNormal: "Normal (Within 24 hours)",
    urgencyUrgent: "Urgent (Within 2 hours)",
    estPayment: "Estimated Payment Structure",
    baseRate: "Base Rate (includes first hour)",
    hourlyRate: "Hourly Rate (thereafter)",
    paymentEstimate: "Estimated Total (Mock)",
    submitRequest: "Find Cooperative Workers",

    // Matching Screens (Worker Continuity)
    findingWorkersTitle: "Finding the best workers for your request",
    findingWorkersDesc: "Applying the Worker Continuity Algorithm to find your top-ranked local cooperative workers",
    topWorkersTitle: "Top 3 Suitable Cooperative Workers Contacted",
    topWorkersDesc: "These top-ranked eligible workers have been notified and given a short response window",
    widerPoolTitle: "Wider Cooperative Pool Activated",
    widerPoolDesc: "No top-ranked worker accepted within the response window, request expanded to the wider cooperative pool",
    nameLabel: "Name",
    ratingLabel: "Rating",
    experienceValue: "{yrs} years exp",
    distanceLabel: "Distance",
    cooperativeName: "Cooperative",
    statusLabel: "Status",
    statusWaiting: "Waiting for response",
    statusAccepted: "Accepted & Assigned",
    statusDeclined: "Unavailable / Busy",
    statusTimeout: "No response (Timed Out)",

    // Booking Confirmed & Status
    bookingConfirmedTitle: "Booking Confirmed",
    bookingConfirmedDesc: "A cooperative worker has accepted your request, details are shown below",
    assignedWorker: "Assigned Worker",
    contactNumber: "Contact Number",
    bookingDetails: "Booking Details",
    serviceStatusTitle: "Service Status Tracker",
    completeJobButton: "Mark Job as Completed",

    // Tracker Stages
    stageCreated: "Request Created",
    stageFinding: "Finding Workers",
    stageTop3: "Top 3 Contacted",
    stageWaiting: "Waiting for Response",
    stageWider: "Wider Pool Activated",
    stageAssigned: "Worker Assigned",
    stageProgress: "In Progress",
    stageCompleted: "Service Completed",

    // Customer Bookings & Reviews
    myBookingsTitle: "My Bookings History",
    noBookings: "No bookings found",
    actionRate: "Rate & Review",
    rateTitle: "Rate your Service Experience",
    ratingScore: "Rating",
    reviewPlaceholder: "Share your experience with the cooperative worker",
    submitReview: "Submit Review",
    reviewSuccess: "Thank you, your feedback supports worker rating and cooperative metrics",
    punctualityLabel: "Punctuality",
    qualityLabel: "Quality of Work",
    professionalismLabel: "Professionalism",
    communicationLabel: "Communication",

    // Worker Dashboard - Home
    workerDashboardTitle: "Worker Dashboard",
    availabilityLabel: "Availability Status",
    available: "Available for Jobs",
    busy: "Busy / Offline",
    earningsTitle: "Earnings This Month (Mock)",
    activeJobTitle: "Active Service Job",
    incomingTitle: "Incoming Job Requests",
    noIncoming: "No incoming job requests at the moment",
    btnAccept: "Accept Job",
    btnReject: "Decline",
    startJobBtn: "Start Service",
    completeJobBtn: "Finish Service",
    jobHistoryTitle: "Completed Jobs Log",
    myOrdersLedgerTitle: "My Orders Ledger",
    availableJobRequestsTitle: "Available Job Requests",

    // Worker Earnings & Wallet
    cooperativeEarningsTitle: "Cooperative Earnings",
    walletBalance: "Wallet Balance",
    availableBalance: "Available Balance",
    pendingBalance: "Pending Balance",
    transactionHistory: "Transaction History",
    redeemButton: "Redeem to Bank",
    redeemAmountLabel: "Redemption Amount",
    payoutMethodLabel: "Payout Method",
    bankTransferMock: "Bank Transfer (Mock)",
    cashPickup: "Cash Pickup",
    insufficientBalance: "Insufficient redeemable balance",
    txnStatusCompleted: "Completed",
    txnStatusProcessing: "Processing",

    // Worker Incentives
    incentiveProgramsTitle: "Incentive Programs",
    rewardLabel: "Reward",
    reasonLabel: "Reason",
    progressLabel: "Progress",
    targetLabel: "Target",
    expiryLabel: "Expiry",
    incentiveStatusPending: "Pending",
    incentiveStatusCompleted: "Completed",
    incentiveStatusExpired: "Expired",

    // Worker Map & Demand
    demandMapTitle: "Location & High-Demand Areas",
    highDemandAreas: "High-Demand Areas",
    openRequestsLabel: "Open Requests",
    zoomInBtn: "Zoom In",
    zoomOutBtn: "Zoom Out",
    fitAllBtn: "Fit All",

    // Worker Welfare
    welfareMonitorTitle: "Worker Welfare Monitor",
    hoursWorkedToday: "Hours Worked Today",
    hoursWorkedWeek: "Hours Worked This Week",
    consecutiveJobStreak: "Consecutive Job Streak",
    restRecommended: "Rest Recommended",

    // Worker Cooperative
    mySocietyTitle: "My Cooperative Society",
    memberSince: "Member Since",
    totalMembers: "Total Members",
    foundedLabel: "Founded",

    // Worker Help, Notifications, Settings
    helpSupportTitle: "Help & Support",
    faqTitle: "Frequently Asked Questions",
    contactSupport: "Contact Support",
    callSupport: "Call Support",
    emailSupport: "Email Support",
    notificationsTitle: "Member Notifications",
    markAllRead: "Mark All as Read",
    noNotifications: "No notifications yet",
    interfaceSettingsTitle: "Interface Settings",
    themeLight: "Light",
    themeDark: "Dark",

    // Admin / Registrar Navigation
    adminNavDashboard: "Dashboard",
    adminNavRequests: "Service Requests",
    adminNavMonitoring: "Continuity Monitor",
    adminNavLiveWorkers: "Live Worker Operations",
    adminNavWorkers: "Workers Directory",
    adminNavCustomers: "Customers Directory",
    adminNavCooperatives: "Cooperatives Directory",
    adminNavBookings: "Bookings Ledger",
    adminNavServices: "Service Sectors",
    adminNavNotifications: "Notifications",
    adminNavReports: "Reports & Analytics",
    adminNavSettings: "Settings",

    // Admin Dashboard
    adminDashboardTitle: "Cooperative Federation Admin Console",
    registrarDashboardOverview: "Registrar Dashboard Overview",
    recentDispatchEvents: "Recent Service Dispatch Events",
    workerOpsSummary: "Worker Availability & Operations Summary",
    totalWorkers: "Total Registered Workers",
    availableWorkers: "Active & Available Workers",
    totalCustomers: "Registered Customers",
    activeBookings: "Active Bookings",
    completedBookings: "Completed Bookings",
    totalCooperatives: "Registered Cooperatives",
    workersTab: "Workers Directory",
    customersTab: "Customers Directory",
    coopsTab: "Cooperatives Directory",
    bookingsTab: "Bookings Ledger",
    servicesTab: "Services Settings",

    // Admin Requests & Dispatch Monitor
    serviceDispatchRequestsTitle: "Service Dispatch Requests",
    continuityDispatchMonitorTitle: "Worker Continuity Dispatch Monitor",
    requestIdLabel: "Request ID",
    forceReassign: "Force Reassign",
    rejectionReasonLabel: "Rejection Reason",

    // Admin Live Worker Operations Map
    liveWorkerOpsTitle: "Live Worker Operations",
    workerStatusAvailable: "Available",
    workerStatusOnJob: "On Job",
    workerStatusTravelling: "Travelling",
    workerStatusOffDuty: "Off Duty",

    // Admin Workers / Customers / Cooperatives / Bookings Detail
    workersDirectoryTitle: "Cooperative Workers Directory",
    workerProfileTitle: "Worker Profile",
    customerAccountsTitle: "Registered Customer Accounts",
    customerAccountTitle: "Customer Account",
    societiesTitle: "Labour Cooperative Societies",
    societyDetailsTitle: "Society Details",
    bookingLedgerTitle: "Platform Booking Ledger",
    bookingInvoiceTitle: "Booking Invoice",
    baseChargeLabel: "Base Charge",
    platformFeeLabel: "Platform Fee",
    totalAmountLabel: "Total Amount",
    paymentMethodLabel: "Payment Method",
    paymentStatusLabel: "Payment Status",
    cashLabel: "Cash",
    directPayLabel: "Direct Pay",
    paymentGatewayNotConfigured: "Payment Gateway Not Configured",
    paymentGatewayComingSoonBody: "Online payments are coming soon, for this prototype please complete your booking using Cash or Direct Pay, both are fully supported",
    paymentGatewayFallbackCta: "Use Cash / Direct Pay Instead",

    // Admin Services Management
    serviceSectorsMgmtTitle: "Service Sectors Management",
    addNewServiceCategory: "Add New Service Category",
    editServiceRates: "Edit Service Rates",

    // Admin Notifications & Reports
    notificationCenterTitle: "Registrar Notification Center",
    broadcastMessage: "Broadcast Message",
    performanceReportsTitle: "Performance Reports & Analytics",
    topPerformingSectors: "Top Performing Service Sectors",
    ratingDistribution: "Cooperative Rating Distribution",

    // Admin Settings
    federationAdminSettingsTitle: "Federation Admin Settings",
    commissionRateLabel: "Commission Rate",
    dispatchTimeoutLabel: "Dispatch Timeout (seconds)",
    poolTimeoutLabel: "Pool Timeout (seconds)",

    // Common Actions & Statuses (PRD-required set)
    navDashboard: "Dashboard",
    navMyBookings: "My Bookings",
    navAvailableRequests: "Available Requests",
    navEarnings: "Earnings",
    navIncentives: "Incentives",
    navMap: "Map & Demand",
    navWelfare: "Welfare",
    navCooperative: "Cooperative",
    navProfile: "Profile",
    navSupport: "Help & Support",
    navNotifications: "Notifications",
    navSettings: "Settings",
    platformAdmin: "Platform Admin",
    registrarConsole: "Registrar Console",
    actionAccept: "Accept",
    actionReject: "Reject",
    actionEditPrice: "Edit Price",
    actionEnable: "Enable",
    actionDisable: "Disable",
    actionApprove: "Approve",
    actionVerify: "Verify",
    statusOffDuty: "Off Duty",
    statusOnDuty: "On Duty",
    statusCompleted: "Completed",
    statusAssigned: "Assigned",
    statusInProgress: "In Progress",
    statusCancelled: "Cancelled"
  },
  hi: {
    // Global / App Shell
    appName: "वर्कसेतु",
    tagline: "घरेलू और सामुदायिक सेवाओं के लिए सहकारी गिग सेवा मंच",
    roleSelection: "भूमिका चुनें",
    customer: "ग्राहक",
    worker: "सहकारी कार्यकर्ता",
    admin: "प्लेटफ़ॉर्म प्रशासक",
    login: "लॉग इन",
    logout: "लॉग आउट",
    register: "पंजीकरण",
    home: "मुख्य पृष्ठ",
    dashboard: "डैशबोर्ड",
    myBookings: "मेरी बुकिंग",
    services: "सेवाएं",
    profile: "प्रोफ़ाइल",
    activeJob: "सक्रिय कार्य",
    incomingRequests: "आने वाले अनुरोध",
    jobHistory: "कार्य इतिहास",
    theme: "थीम",
    language: "भाषा",
    save: "सहेजें",
    cancel: "रद्द करें",
    close: "बंद करें",
    confirm: "पुष्टि करें",
    edit: "संपादित करें",
    delete: "हटाएं",
    search: "खोजें",
    filter: "फ़िल्टर",
    all: "सभी",
    viewDetails: "विवरण देखें",
    viewAll: "सभी देखें",
    loading: "लोड हो रहा है",
    noDataFound: "कोई डेटा नहीं मिला",

    // Landing Page
    landingTitle: "सहकारी कार्यकर्ताओं का सशक्तिकरण, समुदायों की सेवा",
    landingSubtitle: "घरेलू सेवाओं के लिए स्थानीय श्रम सहकारी समितियों के कुशल, सत्यापित और विश्वसनीय पेशेवरों से जुड़ें",
    getStarted: "ग्राहक के रूप में शुरू करें",
    joinAsWorker: "सहकारी कार्यकर्ता के रूप में शामिल हों",
    whyChooseUs: "वर्कसेतु को क्यों चुनें?",
    why1Title: "सहकारी समर्थित",
    why1Desc: "प्रत्येक कार्यकर्ता एक पंजीकृत श्रम सहकारी समिति का प्रमाणित सदस्य है",
    why2Title: "कार्यकर्ता निरंतरता",
    why2Desc: "हमारी स्मार्ट प्रेषण प्रणाली विश्वसनीय निरंतर सेवा के लिए परिचित स्थानीय कार्यकर्ताओं को प्राथमिकता देती है",
    why3Title: "उचित कमाई",
    why3Desc: "सहकारी समितियां सभी कार्यकर्ताओं के लिए उचित वेतन और सामाजिक सुरक्षा लाभ सुनिश्चित करती हैं",
    statsTitle: "प्लेटफ़ॉर्म का प्रभाव",
    statWorkers: "कुशल कार्यकर्ता",
    statBookings: "पूरे किए गए कार्य",
    statCooperatives: "सक्रिय सहकारी समितियां",

    // Auth Screens
    customerLoginTitle: "ग्राहक लॉगिन",
    workerLoginTitle: "कार्यकर्ता लॉगिन",
    adminLoginTitle: "प्रशासक लॉगिन",
    emailPlaceholder: "ईमेल या फोन नंबर दर्ज करें",
    passwordPlaceholder: "पासवर्ड दर्ज करें",
    loginButton: "साइन इन",
    noAccount: "खाता नहीं है?",
    registerLink: "यहाँ पंजीकरण करें",
    alreadyHaveAccount: "पहले से खाता है?",
    loginLink: "यहाँ लॉगिन करें",
    fullName: "पूरा नाम",
    cooperativeLabel: "सहकारी समिति चुनें",
    skillLabel: "प्राथमिक कौशल चुनें",
    experienceLabel: "अनुभव (वर्षों में)",
    customerRegisterTitle: "ग्राहक पंजीकरण",
    workerRegisterTitle: "कार्यकर्ता पंजीकरण",

    // Services
    servicesTitle: "सेवा बुक करें",
    servicesSubtitle: "कुशल सहकारी कार्यकर्ताओं को खोजने के लिए नीचे एक श्रेणी चुनें",
    plumbing: "नलसाजी (प्लम्बिंग)",
    electrical: "बिजली सेवाएं",
    carpentry: "बढ़ईगीरी (कारपेंट्री)",
    painting: "पुताई (पेंटिंग)",
    caregiving: "घरेलू देखभाल (केयरगिवर)",
    gardening: "बागवानी और भूनिर्माण",
    cleaning: "घर की सफाई",
    domesticHelp: "घरेलू सहायता और रसोइया",
    actionBookService: "सेवा बुक करें",

    // Service Request Form
    requestServiceTitle: "सेवा अनुरोध बनाएं",
    locationLabel: "सेवा स्थान / पता",
    locationPlaceholder: "अपना पता दर्ज करें",
    descLabel: "अपनी आवश्यकताओं का वर्णन करें",
    descPlaceholder: "कार्य का विवरण लिखें, जैसे: 'रसोई का नल लीक हो रहा है और पाइप बदलना है'",
    datetimeLabel: "निर्धारित तिथि और समय",
    urgencyLabel: "आपात स्थिति का स्तर",
    urgencyNormal: "सामान्य (24 घंटे के भीतर)",
    urgencyUrgent: "अत्यावश्यक (2 घंटे के भीतर)",
    estPayment: "अनुमानित भुगतान संरचना",
    baseRate: "मूल दर (पहले घंटे शामिल)",
    hourlyRate: "प्रति घंटा दर (उसके बाद)",
    paymentEstimate: "अनुमानित कुल (मॉक)",
    submitRequest: "सहकारी कार्यकर्ताओं को खोजें",

    // Matching Screens (Worker Continuity)
    findingWorkersTitle: "आपके अनुरोध के लिए सर्वश्रेष्ठ कार्यकर्ताओं की खोज",
    findingWorkersDesc: "आपके शीर्ष रैंक वाले स्थानीय सहकारी कार्यकर्ताओं को खोजने के लिए कार्यकर्ता निरंतरता एल्गोरिथम लागू किया जा रहा है",
    topWorkersTitle: "शीर्ष 3 उपयुक्त सहकारी कार्यकर्ताओं से संपर्क किया गया",
    topWorkersDesc: "इन शीर्ष रैंक वाले पात्र कार्यकर्ताओं को सूचित किया गया है और एक संक्षिप्त प्रतिक्रिया समय दिया गया है",
    widerPoolTitle: "व्यापक सहकारी पूल सक्रिय",
    widerPoolDesc: "प्रतिक्रिया समय के भीतर किसी भी शीर्ष रैंक वाले कार्यकर्ता ने स्वीकार नहीं किया, अनुरोध को व्यापक सहकारी पूल में विस्तारित किया गया",
    nameLabel: "नाम",
    ratingLabel: "रेटिंग",
    experienceValue: "{yrs} वर्ष का अनुभव",
    distanceLabel: "दूरी",
    cooperativeName: "सहकारी समिति",
    statusLabel: "स्थिति",
    statusWaiting: "प्रतिक्रिया की प्रतीक्षा है",
    statusAccepted: "स्वीकार और आवंटित",
    statusDeclined: "अनुपलब्ध / व्यस्त",
    statusTimeout: "कोई प्रतिक्रिया नहीं (समय समाप्त)",

    // Booking Confirmed & Status
    bookingConfirmedTitle: "बुकिंग की पुष्टि हो गई",
    bookingConfirmedDesc: "एक सहकारी कार्यकर्ता ने आपका अनुरोध स्वीकार कर लिया है, विवरण नीचे दिखाया गया है",
    assignedWorker: "आवंटित कार्यकर्ता",
    contactNumber: "संपर्क नंबर",
    bookingDetails: "बुकिंग विवरण",
    serviceStatusTitle: "सेवा स्थिति ट्रैकर",
    completeJobButton: "कार्य को पूरा घोषित करें",

    // Tracker Stages
    stageCreated: "अनुरोध बनाया गया",
    stageFinding: "कार्यकर्ता खोजे जा रहे हैं",
    stageTop3: "शीर्ष 3 से संपर्क किया",
    stageWaiting: "प्रतिक्रिया की प्रतीक्षा",
    stageWider: "व्यापक पूल सक्रिय",
    stageAssigned: "कार्यकर्ता आवंटित",
    stageProgress: "कार्य प्रगति पर",
    stageCompleted: "सेवा संपन्न",

    // Customer Bookings & Reviews
    myBookingsTitle: "मेरी बुकिंग का इतिहास",
    noBookings: "कोई बुकिंग नहीं मिली",
    actionRate: "रेटिंग और समीक्षा",
    rateTitle: "अपने सेवा अनुभव को रेट करें",
    ratingScore: "रेटिंग",
    reviewPlaceholder: "सहकारी कार्यकर्ता के साथ अपना अनुभव साझा करें",
    submitReview: "समीक्षा सबमिट करें",
    reviewSuccess: "धन्यवाद, आपकी प्रतिक्रिया कार्यकर्ता रेटिंग और सहकारी मेट्रिक्स का समर्थन करती है",
    punctualityLabel: "समयपालन",
    qualityLabel: "कार्य की गुणवत्ता",
    professionalismLabel: "व्यावसायिकता",
    communicationLabel: "संचार",

    // Worker Dashboard - Home
    workerDashboardTitle: "कार्यकर्ता डैशबोर्ड",
    availabilityLabel: "उपलब्धता की स्थिति",
    available: "काम के लिए उपलब्ध",
    busy: "व्यस्त / ऑफ़लाइन",
    earningsTitle: "इस महीने की कमाई (मॉक)",
    activeJobTitle: "सक्रिय सेवा कार्य",
    incomingTitle: "आने वाले कार्य अनुरोध",
    noIncoming: "इस समय कोई आने वाला कार्य अनुरोध नहीं है",
    btnAccept: "कार्य स्वीकार करें",
    btnReject: "अस्वीकार करें",
    startJobBtn: "सेवा शुरू करें",
    completeJobBtn: "सेवा समाप्त करें",
    jobHistoryTitle: "पूरे किए गए कार्यों का लॉग",
    myOrdersLedgerTitle: "मेरा ऑर्डर लेजर",
    availableJobRequestsTitle: "उपलब्ध कार्य अनुरोध",

    // Worker Earnings & Wallet
    cooperativeEarningsTitle: "सहकारी कमाई",
    walletBalance: "वॉलेट शेष राशि",
    availableBalance: "उपलब्ध शेष राशि",
    pendingBalance: "लंबित शेष राशि",
    transactionHistory: "लेनदेन इतिहास",
    redeemButton: "बैंक में भुनाएं",
    redeemAmountLabel: "भुनाने की राशि",
    payoutMethodLabel: "भुगतान विधि",
    bankTransferMock: "बैंक ट्रांसफर (मॉक)",
    cashPickup: "नकद पिकअप",
    insufficientBalance: "अपर्याप्त भुनाने योग्य शेष राशि",
    txnStatusCompleted: "पूर्ण",
    txnStatusProcessing: "प्रक्रियाधीन",

    // Worker Incentives
    incentiveProgramsTitle: "प्रोत्साहन कार्यक्रम",
    rewardLabel: "इनाम",
    reasonLabel: "कारण",
    progressLabel: "प्रगति",
    targetLabel: "लक्ष्य",
    expiryLabel: "समाप्ति",
    incentiveStatusPending: "लंबित",
    incentiveStatusCompleted: "पूर्ण",
    incentiveStatusExpired: "समाप्त",

    // Worker Map & Demand
    demandMapTitle: "स्थान और उच्च-मांग क्षेत्र",
    highDemandAreas: "उच्च-मांग क्षेत्र",
    openRequestsLabel: "खुले अनुरोध",
    zoomInBtn: "ज़ूम इन",
    zoomOutBtn: "ज़ूम आउट",
    fitAllBtn: "सभी फ़िट करें",

    // Worker Welfare
    welfareMonitorTitle: "कार्यकर्ता कल्याण मॉनिटर",
    hoursWorkedToday: "आज काम किए गए घंटे",
    hoursWorkedWeek: "इस सप्ताह काम किए गए घंटे",
    consecutiveJobStreak: "लगातार कार्य श्रृंखला",
    restRecommended: "आराम की सिफारिश की गई",

    // Worker Cooperative
    mySocietyTitle: "मेरी सहकारी समिति",
    memberSince: "सदस्य बने",
    totalMembers: "कुल सदस्य",
    foundedLabel: "स्थापना वर्ष",

    // Worker Help, Notifications, Settings
    helpSupportTitle: "सहायता और समर्थन",
    faqTitle: "अक्सर पूछे जाने वाले प्रश्न",
    contactSupport: "सहायता से संपर्क करें",
    callSupport: "सहायता को कॉल करें",
    emailSupport: "सहायता को ईमेल करें",
    notificationsTitle: "सदस्य सूचनाएं",
    markAllRead: "सभी को पढ़ा हुआ चिह्नित करें",
    noNotifications: "अभी तक कोई सूचना नहीं",
    interfaceSettingsTitle: "इंटरफ़ेस सेटिंग्स",
    themeLight: "हल्का",
    themeDark: "गहरा",

    // Admin / Registrar Navigation
    adminNavDashboard: "डैशबोर्ड",
    adminNavRequests: "सेवा अनुरोध",
    adminNavMonitoring: "निरंतरता मॉनिटर",
    adminNavLiveWorkers: "लाइव कार्यकर्ता संचालन",
    adminNavWorkers: "कार्यकर्ता निर्देशिका",
    adminNavCustomers: "ग्राहक निर्देशिका",
    adminNavCooperatives: "सहकारी निर्देशिका",
    adminNavBookings: "बुकिंग लेजर",
    adminNavServices: "सेवा क्षेत्र",
    adminNavNotifications: "सूचनाएं",
    adminNavReports: "रिपोर्ट और विश्लेषण",
    adminNavSettings: "सेटिंग्स",

    // Admin Dashboard
    adminDashboardTitle: "सहकारी संघ व्यवस्थापक कंसोल",
    registrarDashboardOverview: "रजिस्ट्रार डैशबोर्ड अवलोकन",
    recentDispatchEvents: "हाल की सेवा प्रेषण घटनाएं",
    workerOpsSummary: "कार्यकर्ता उपलब्धता और संचालन सारांश",
    totalWorkers: "कुल पंजीकृत कार्यकर्ता",
    availableWorkers: "सक्रिय और उपलब्ध कार्यकर्ता",
    totalCustomers: "पंजीकृत ग्राहक",
    activeBookings: "सक्रिय बुकिंग",
    completedBookings: "पूरी हुई बुकिंग",
    totalCooperatives: "पंजीकृत सहकारी समितियां",
    workersTab: "कार्यकर्ता निर्देशिका",
    customersTab: "ग्राहक निर्देशिका",
    coopsTab: "सहकारी निर्देशिका",
    bookingsTab: "बुकिंग खाता",
    servicesTab: "सेवाएं सेटिंग्स",

    // Admin Requests & Dispatch Monitor
    serviceDispatchRequestsTitle: "सेवा प्रेषण अनुरोध",
    continuityDispatchMonitorTitle: "कार्यकर्ता निरंतरता प्रेषण मॉनिटर",
    requestIdLabel: "अनुरोध आईडी",
    forceReassign: "बलपूर्वक पुनः आवंटित करें",
    rejectionReasonLabel: "अस्वीकृति का कारण",

    // Admin Live Worker Operations Map
    liveWorkerOpsTitle: "लाइव कार्यकर्ता संचालन",
    workerStatusAvailable: "उपलब्ध",
    workerStatusOnJob: "कार्य पर",
    workerStatusTravelling: "यात्रा पर",
    workerStatusOffDuty: "ड्यूटी पर नहीं",

    // Admin Workers / Customers / Cooperatives / Bookings Detail
    workersDirectoryTitle: "सहकारी कार्यकर्ता निर्देशिका",
    workerProfileTitle: "कार्यकर्ता प्रोफ़ाइल",
    customerAccountsTitle: "पंजीकृत ग्राहक खाते",
    customerAccountTitle: "ग्राहक खाता",
    societiesTitle: "श्रम सहकारी समितियां",
    societyDetailsTitle: "समिति विवरण",
    bookingLedgerTitle: "प्लेटफ़ॉर्म बुकिंग लेजर",
    bookingInvoiceTitle: "बुकिंग चालान",
    baseChargeLabel: "मूल शुल्क",
    platformFeeLabel: "प्लेटफ़ॉर्म शुल्क",
    totalAmountLabel: "कुल राशि",
    paymentMethodLabel: "भुगतान विधि",
    paymentStatusLabel: "भुगतान स्थिति",
    cashLabel: "नकद",
    directPayLabel: "प्रत्यक्ष भुगतान",
    paymentGatewayNotConfigured: "भुगतान गेटवे कॉन्फ़िगर नहीं है",
    paymentGatewayComingSoonBody: "ऑनलाइन भुगतान जल्द आ रहा है, इस प्रोटोटाइप के लिए कृपया नकद या प्रत्यक्ष भुगतान से अपनी बुकिंग पूरी करें, दोनों पूरी तरह समर्थित हैं",
    paymentGatewayFallbackCta: "इसके बजाय नकद / प्रत्यक्ष भुगतान का उपयोग करें",

    // Admin Services Management
    serviceSectorsMgmtTitle: "सेवा क्षेत्र प्रबंधन",
    addNewServiceCategory: "नई सेवा श्रेणी जोड़ें",
    editServiceRates: "सेवा दरें संपादित करें",

    // Admin Notifications & Reports
    notificationCenterTitle: "रजिस्ट्रार सूचना केंद्र",
    broadcastMessage: "संदेश प्रसारित करें",
    performanceReportsTitle: "प्रदर्शन रिपोर्ट और विश्लेषण",
    topPerformingSectors: "शीर्ष प्रदर्शन करने वाले सेवा क्षेत्र",
    ratingDistribution: "सहकारी रेटिंग वितरण",

    // Admin Settings
    federationAdminSettingsTitle: "संघ व्यवस्थापक सेटिंग्स",
    commissionRateLabel: "कमीशन दर",
    dispatchTimeoutLabel: "प्रेषण समयबाह्य (सेकंड)",
    poolTimeoutLabel: "पूल समयबाह्य (सेकंड)",

    // Common Actions & Statuses (PRD-required set)
    navDashboard: "डैशबोर्ड",
    navMyBookings: "मेरी बुकिंग",
    navAvailableRequests: "उपलब्ध अनुरोध",
    navEarnings: "कमाई",
    navIncentives: "प्रोत्साहन",
    navMap: "मानचित्र और मांग",
    navWelfare: "कल्याण",
    navCooperative: "सहकारी समिति",
    navProfile: "प्रोफ़ाइल",
    navSupport: "सहायता और समर्थन",
    navNotifications: "सूचनाएं",
    navSettings: "सेटिंग्स",
    platformAdmin: "प्लेटफ़ॉर्म प्रशासक",
    registrarConsole: "रजिस्ट्रार कंसोल",
    actionAccept: "स्वीकार करें",
    actionReject: "अस्वीकार करें",
    actionEditPrice: "कीमत संपादित करें",
    actionEnable: "सक्षम करें",
    actionDisable: "अक्षम करें",
    actionApprove: "स्वीकृत करें",
    actionVerify: "सत्यापित करें",
    statusOffDuty: "ड्यूटी पर नहीं",
    statusOnDuty: "ड्यूटी पर",
    statusCompleted: "पूर्ण",
    statusAssigned: "आवंटित",
    statusInProgress: "प्रगति पर",
    statusCancelled: "रद्द"
  },
  ta: {
    // Global / App Shell
    appName: "Worksetu",
    tagline: "கூட்டுறவு கிக் சேவைகள் தளம் - குடும்பங்கள் மற்றும் சமூகங்களுக்கு",
    roleSelection: "பயனரைத் தேர்ந்தெடுக்கவும்",
    customer: "வாடிக்கையாளர்",
    worker: "கூட்டுறவு பணியாளர்",
    admin: "தள நிர்வாகி",
    login: "உள்நுழைய",
    logout: "வெளியேற",
    register: "பதிவு செய்க",
    home: "முகப்பு",
    dashboard: "டாஷ்போர்டு",
    myBookings: "எனது முன்பதிவுகள்",
    services: "சேவைகள்",
    profile: "சுயவிவரம்",
    activeJob: "செயலில் உள்ள பணி",
    incomingRequests: "வந்த பணி கோரிக்கைகள்",
    jobHistory: "பணி வரலாறு",
    theme: "தீம்",
    language: "மொழி",
    save: "சேமி",
    cancel: "ரத்து செய்",
    close: "மூடு",
    confirm: "உறுதிசெய்",
    edit: "திருத்து",
    delete: "நீக்கு",
    search: "தேடு",
    filter: "வடிகட்டி",
    all: "அனைத்தும்",
    viewDetails: "விவரங்களைக் காண்க",
    viewAll: "அனைத்தையும் காண்க",
    loading: "ஏற்றுகிறது",
    noDataFound: "தரவு எதுவும் கிடைக்கவில்லை",

    // Landing Page
    landingTitle: "கூட்டுறவு தொழிலாளர்களை மேம்படுத்துதல், சமூகங்களுக்கு சேவை செய்தல்",
    landingSubtitle: "வீட்டுச் சேவைகளுக்காக உள்ளூர் தொழிலாளர் கூட்டுறவு சங்கங்களைச் சேர்ந்த திறமையான, சரிபார்க்கப்பட்ட மற்றும் நம்பகமான நிபுணர்களுடன் இணையுங்கள்",
    getStarted: "வாடிக்கையாளராகத் தொடங்குங்கள்",
    joinAsWorker: "கூட்டுறவு தொழிலாளராக சேருங்கள்",
    whyChooseUs: "ஏன் Worksetu-வை தேர்வு செய்ய வேண்டும்?",
    why1Title: "கூட்டுறவு ஆதரவு பெற்ற",
    why1Desc: "ஒவ்வொரு தொழிலாளியும் பதிவுசெய்யப்பட்ட தொழிலாளர் கூட்டுறவு சங்கத்தின் சான்றளிக்கப்பட்ட உறுப்பினர் ஆவார்",
    why2Title: "பணியாளர் தொடர்ச்சி",
    why2Desc: "எங்கள் ஸ்மார்ட் விநியோக முறை, நம்பகமான தொடர்ச்சியான சேவைக்கு நன்கு அறிமுகமான உள்ளூர் தொழிலாளர்களுக்கு முன்னுரிமை அளிக்கிறது",
    why3Title: "நியாயமான வருமானம்",
    why3Desc: "கூட்டுறவு சங்கங்கள் அனைத்து தொழிலாளர்களுக்கும் நியாயமான ஊதியம் மற்றும் சமூக பாதுகாப்பு நன்மைகளை உறுதி செய்கின்றன",
    statsTitle: "தளத்தின் தாக்கம்",
    statWorkers: "திறமையான தொழிலாளர்கள்",
    statBookings: "நிறைவுற்ற பணிகள்",
    statCooperatives: "செயலில் உள்ள கூட்டுறவுகள்",

    // Auth Screens
    customerLoginTitle: "வாடிக்கையாளர் உள்நுழைவு",
    workerLoginTitle: "தொழிலாளி உள்நுழைவு",
    adminLoginTitle: "நிர்வாகி உள்நுழைவு",
    emailPlaceholder: "மின்னஞ்சல் அல்லது தொலைபேசி எண்ணை உள்ளிடவும்",
    passwordPlaceholder: "கடவுச்சொல்லை உள்ளிடவும்",
    loginButton: "உள்நுழைய",
    noAccount: "கணக்கு இல்லையா?",
    registerLink: "இங்கே பதிவு செய்யவும்",
    alreadyHaveAccount: "ஏற்கனவே கணக்கு உள்ளதா?",
    loginLink: "இங்கே உள்நுழையவும்",
    fullName: "முழு பெயர்",
    cooperativeLabel: "கூட்டுறவு சங்கத்தைத் தேர்ந்தெடுக்கவும்",
    skillLabel: "முதன்மைத் திறனைத் தேர்ந்தெடுக்கவும்",
    experienceLabel: "அனுபவம் (ஆண்டுகளில்)",
    customerRegisterTitle: "வாடிக்கையாளர் பதிவு",
    workerRegisterTitle: "தொழிலாளி பதிவு",

    // Services
    servicesTitle: "சேவையைப் பதிவு செய்க",
    servicesSubtitle: "திறமையான கூட்டுறவு தொழிலாளர்களைக் கண்டறிய கீழே உள்ள வகையைத் தேர்ந்தெடுக்கவும்",
    plumbing: "குழாய் வேலை (பிளம்பிங்)",
    electrical: "மின்சார சேவைகள்",
    carpentry: "தச்சு வேலை",
    painting: "வண்ணம் பூசுதல் (பெயிண்டிங்)",
    caregiving: "வீட்டு பராமரிப்பு (நலன்பேணல்)",
    gardening: "தோட்டக்கலை & இயற்கையமைப்பு",
    cleaning: "வீடு சுத்தம் செய்தல்",
    domesticHelp: "வீட்டு உதவி & சமையல்",
    actionBookService: "சேவையை பதிவு செய்",

    // Service Request Form
    requestServiceTitle: "சேவை கோரிக்கையை உருவாக்கவும்",
    locationLabel: "சேவை இடம் / முகவரி",
    locationPlaceholder: "உங்கள் முகவரியை உள்ளிடவும்",
    descLabel: "உங்கள் தேவைகளை விவரிக்கவும்",
    descPlaceholder: "வேலை விவரங்களை விவரிக்கவும், எ.கா., 'சமையலறை குழாய் கசிகிறது, குழாயை மாற்ற வேண்டும்'",
    datetimeLabel: "திட்டமிடப்பட்ட தேதி & நேரம்",
    urgencyLabel: "அவசர நிலை",
    urgencyNormal: "சாதாரண (24 மணி நேரத்திற்குள்)",
    urgencyUrgent: "அவசரம் (2 மணி நேரத்திற்குள்)",
    estPayment: "மதிப்பிடப்பட்ட கட்டண அமைப்பு",
    baseRate: "அடிப்படை கட்டணம் (முதல் மணிநேரம் உட்பட)",
    hourlyRate: "மணிநேர கட்டணம் (அதன் பிறகு)",
    paymentEstimate: "மதிப்பிடப்பட்ட மொத்தம் (மாதிரி)",
    submitRequest: "கூட்டுறவு தொழிலாளர்களைக் கண்டறியவும்",

    // Matching Screens (Worker Continuity)
    findingWorkersTitle: "உங்கள் கோரிக்கைக்கான சிறந்த பணியாளர்களைக் கண்டறிதல்",
    findingWorkersDesc: "உங்கள் உயர்தர உள்ளூர் கூட்டுறவு பணியாளர்களைக் கண்டறிய பணியாளர் தொடர்ச்சி அல்காரிதத்தை செயல்படுத்துகிறது",
    topWorkersTitle: "முதல் 3 தகுதியான கூட்டுறவு தொழிலாளர்கள் தொடர்பு கொள்ளப்பட்டனர்",
    topWorkersDesc: "இந்த உயர்தர தொழிலாளர்களுக்கு அறிவிக்கப்பட்டு, ஒரு சிறிய மறுமொழி அவகாசம் வழங்கப்பட்டுள்ளது",
    widerPoolTitle: "பரந்த கூட்டுறவு பூல் செயல்படுத்தப்பட்டது",
    widerPoolDesc: "மறுமொழி அவகாசத்திற்குள் எந்தவொரு உயர்தர தொழிலாளியும் ஏற்கவில்லை, கோரிக்கை பரந்த கூட்டுறவு குழுவிற்கு விரிவாக்கப்பட்டுள்ளது",
    nameLabel: "பெயர்",
    ratingLabel: "மதிப்பீடு",
    experienceValue: "{yrs} வருட அனுபவம்",
    distanceLabel: "தொலைவு",
    cooperativeName: "கூட்டுறவு சங்கம்",
    statusLabel: "நிலை",
    statusWaiting: "பதிலுக்காக காத்திருக்கிறது",
    statusAccepted: "ஏற்கப்பட்டு ஒதுக்கப்பட்டது",
    statusDeclined: "கிடைக்கவில்லை / பிஸியாக உள்ளார்",
    statusTimeout: "பதில் இல்லை (நேரம் முடிந்தது)",

    // Booking Confirmed & Status
    bookingConfirmedTitle: "முன்பதிவு உறுதி செய்யப்பட்டது",
    bookingConfirmedDesc: "ஒரு கூட்டுறவு தொழிலாளி உங்கள் கோரிக்கையை ஏற்றுக்கொண்டார், விவரங்கள் கீழே காட்டப்பட்டுள்ளன",
    assignedWorker: "ஒதுக்கப்பட்ட பணியாளர்",
    contactNumber: "தொடர்பு எண்",
    bookingDetails: "முன்பதிவு விவரங்கள்",
    serviceStatusTitle: "சேவை நிலை கண்காணிப்பு",
    completeJobButton: "வேலை முடிந்ததாகக் குறிக்கவும்",

    // Tracker Stages
    stageCreated: "கோரிக்கை உருவாக்கப்பட்டது",
    stageFinding: "தொழிலாளர்கள் தேடப்படுகிறார்கள்",
    stageTop3: "முதல் 3 தொடர்பு கொள்ளப்பட்டனர்",
    stageWaiting: "பதிலுக்காக காத்திருக்கிறது",
    stageWider: "பரந்த பூல் செயல்படுத்தப்பட்டது",
    stageAssigned: "பணியாளர் ஒதுக்கப்பட்டார்",
    stageProgress: "பணி செயல்பாட்டில் உள்ளது",
    stageCompleted: "சேவை முடிந்தது",

    // Customer Bookings & Reviews
    myBookingsTitle: "எனது முன்பதிவு வரலாறு",
    noBookings: "முன்பதிவுகள் எதுவும் இல்லை",
    actionRate: "மதிப்பீடு & கருத்து",
    rateTitle: "உங்கள் சேவை அனுபவத்தை மதிப்பிடுங்கள்",
    ratingScore: "மதிப்பீடு",
    reviewPlaceholder: "கூட்டுறவு தொழிலாளி பற்றிய உங்கள் அனுபவத்தைப் பகிர்ந்து கொள்ளுங்கள்",
    submitReview: "மதிப்பீட்டை சமர்ப்பிக்கவும்",
    reviewSuccess: "நன்றி, உங்கள் கருத்து தொழிலாளர் மதிப்பீடு மற்றும் கூட்டுறவு அளவீடுகளை ஆதரிக்கிறது",
    punctualityLabel: "நேரம் தவறாமை",
    qualityLabel: "பணியின் தரம்",
    professionalismLabel: "தொழில்முறை",
    communicationLabel: "தொடர்பாடல்",

    // Worker Dashboard - Home
    workerDashboardTitle: "தொழிலாளி டாஷ்போர்டு",
    availabilityLabel: "கிடைக்கும் நிலை",
    available: "பணிக்கு தயார்",
    busy: "பிஸி / ஆஃப்லைன்",
    earningsTitle: "இந்த மாத வருமானம் (மாதிரி)",
    activeJobTitle: "செயலில் உள்ள சேவை பணி",
    incomingTitle: "வந்த பணி கோரிக்கைகள்",
    noIncoming: "தற்போது எந்த பணி கோரிக்கைகளும் வரவில்லை",
    btnAccept: "பணியை ஏற்றுக்கொள்",
    btnReject: "நிராகரி",
    startJobBtn: "சேவையைத் தொடங்கு",
    completeJobBtn: "சேவையை முடி",
    jobHistoryTitle: "முடிவடைந்த பணிகள் பதிவு",
    myOrdersLedgerTitle: "எனது ஆர்டர் பேரேடு",
    availableJobRequestsTitle: "கிடைக்கும் பணி கோரிக்கைகள்",

    // Worker Earnings & Wallet
    cooperativeEarningsTitle: "கூட்டுறவு வருமானம்",
    walletBalance: "பணப்பை இருப்பு",
    availableBalance: "கிடைக்கும் இருப்பு",
    pendingBalance: "நிலுவையில் உள்ள இருப்பு",
    transactionHistory: "பரிவர்த்தனை வரலாறு",
    redeemButton: "வங்கிக்கு மாற்று",
    redeemAmountLabel: "மாற்றும் தொகை",
    payoutMethodLabel: "பணம் செலுத்தும் முறை",
    bankTransferMock: "வங்கி பரிமாற்றம் (மாதிரி)",
    cashPickup: "பணம் பெறுதல்",
    insufficientBalance: "மாற்றுவதற்கு போதிய இருப்பு இல்லை",
    txnStatusCompleted: "முடிந்தது",
    txnStatusProcessing: "செயலாக்கத்தில்",

    // Worker Incentives
    incentiveProgramsTitle: "ஊக்கத்தொகை திட்டங்கள்",
    rewardLabel: "வெகுமதி",
    reasonLabel: "காரணம்",
    progressLabel: "முன்னேற்றம்",
    targetLabel: "இலக்கு",
    expiryLabel: "காலாவதி",
    incentiveStatusPending: "நிலுவையில்",
    incentiveStatusCompleted: "முடிந்தது",
    incentiveStatusExpired: "காலாவதியானது",

    // Worker Map & Demand
    demandMapTitle: "இடம் & அதிக தேவை பகுதிகள்",
    highDemandAreas: "அதிக தேவை பகுதிகள்",
    openRequestsLabel: "திறந்த கோரிக்கைகள்",
    zoomInBtn: "பெரிதாக்கு",
    zoomOutBtn: "சிறிதாக்கு",
    fitAllBtn: "அனைத்தையும் பொருத்து",

    // Worker Welfare
    welfareMonitorTitle: "தொழிலாளர் நலன் கண்காணிப்பு",
    hoursWorkedToday: "இன்று பணிபுரிந்த மணிநேரம்",
    hoursWorkedWeek: "இந்த வாரம் பணிபுரிந்த மணிநேரம்",
    consecutiveJobStreak: "தொடர்ச்சியான பணி வரிசை",
    restRecommended: "ஓய்வு பரிந்துரைக்கப்படுகிறது",

    // Worker Cooperative
    mySocietyTitle: "எனது கூட்டுறவு சங்கம்",
    memberSince: "உறுப்பினரான நாள்",
    totalMembers: "மொத்த உறுப்பினர்கள்",
    foundedLabel: "நிறுவப்பட்ட ஆண்டு",

    // Worker Help, Notifications, Settings
    helpSupportTitle: "உதவி & ஆதரவு",
    faqTitle: "அடிக்கடி கேட்கப்படும் கேள்விகள்",
    contactSupport: "ஆதரவை தொடர்பு கொள்ளவும்",
    callSupport: "ஆதரவை அழைக்கவும்",
    emailSupport: "ஆதரவுக்கு மின்னஞ்சல் அனுப்பவும்",
    notificationsTitle: "உறுப்பினர் அறிவிப்புகள்",
    markAllRead: "அனைத்தையும் படித்ததாகக் குறி",
    noNotifications: "இதுவரை அறிவிப்புகள் இல்லை",
    interfaceSettingsTitle: "இடைமுக அமைப்புகள்",
    themeLight: "வெளிர்",
    themeDark: "இருள்",

    // Admin / Registrar Navigation
    adminNavDashboard: "டாஷ்போர்டு",
    adminNavRequests: "சேவை கோரிக்கைகள்",
    adminNavMonitoring: "தொடர்ச்சி கண்காணிப்பு",
    adminNavLiveWorkers: "நேரடி பணியாளர் செயல்பாடுகள்",
    adminNavWorkers: "தொழிலாளர்கள் கோப்பு",
    adminNavCustomers: "வாடிக்கையாளர்கள் கோப்பு",
    adminNavCooperatives: "கூட்டுறவு சங்கங்கள் கோப்பு",
    adminNavBookings: "முன்பதிவுகள் பேரேடு",
    adminNavServices: "சேவை பிரிவுகள்",
    adminNavNotifications: "அறிவிப்புகள்",
    adminNavReports: "அறிக்கைகள் & பகுப்பாய்வு",
    adminNavSettings: "அமைப்புகள்",

    // Admin Dashboard
    adminDashboardTitle: "கூட்டுறவு கூட்டமைப்பு நிர்வாகி கன்சோல்",
    registrarDashboardOverview: "பதிவாளர் டாஷ்போர்டு கண்ணோட்டம்",
    recentDispatchEvents: "சமீபத்திய சேவை அனுப்புதல் நிகழ்வுகள்",
    workerOpsSummary: "பணியாளர் கிடைக்கும் நிலை & செயல்பாட்டு சுருக்கம்",
    totalWorkers: "மொத்த பதிவு செய்யப்பட்ட தொழிலாளர்கள்",
    availableWorkers: "செயலில் & கிடைக்கும் தொழிலாளர்கள்",
    totalCustomers: "பதிவு செய்யப்பட்ட வாடிக்கையாளர்கள்",
    activeBookings: "செயலில் உள்ள முன்பதிவுகள்",
    completedBookings: "முடிவடைந்த முன்பதிவுகள்",
    totalCooperatives: "பதிவு செய்யப்பட்ட கூட்டுறவு சங்கங்கள்",
    workersTab: "தொழிலாளர்கள் கோப்பு",
    customersTab: "வாடிக்கையாளர்கள் கோப்பு",
    coopsTab: "கூட்டுறவு சங்கங்கள் கோப்பு",
    bookingsTab: "முன்பதிவுகள் பேரேடு",
    servicesTab: "சேவைகள் அமைப்புகள்",

    // Admin Requests & Dispatch Monitor
    serviceDispatchRequestsTitle: "சேவை அனுப்புதல் கோரிக்கைகள்",
    continuityDispatchMonitorTitle: "பணியாளர் தொடர்ச்சி அனுப்புதல் கண்காணிப்பு",
    requestIdLabel: "கோரிக்கை ஐடி",
    forceReassign: "கட்டாய மறு ஒதுக்கீடு",
    rejectionReasonLabel: "நிராகரிப்பு காரணம்",

    // Admin Live Worker Operations Map
    liveWorkerOpsTitle: "நேரடி பணியாளர் செயல்பாடுகள்",
    workerStatusAvailable: "கிடைக்கிறார்",
    workerStatusOnJob: "பணியில்",
    workerStatusTravelling: "பயணத்தில்",
    workerStatusOffDuty: "பணியில் இல்லை",

    // Admin Workers / Customers / Cooperatives / Bookings Detail
    workersDirectoryTitle: "கூட்டுறவு தொழிலாளர்கள் கோப்பு",
    workerProfileTitle: "தொழிலாளர் சுயவிவரம்",
    customerAccountsTitle: "பதிவு செய்யப்பட்ட வாடிக்கையாளர் கணக்குகள்",
    customerAccountTitle: "வாடிக்கையாளர் கணக்கு",
    societiesTitle: "தொழிலாளர் கூட்டுறவு சங்கங்கள்",
    societyDetailsTitle: "சங்க விவரங்கள்",
    bookingLedgerTitle: "தள முன்பதிவு பேரேடு",
    bookingInvoiceTitle: "முன்பதிவு விலைப்பட்டியல்",
    baseChargeLabel: "அடிப்படை கட்டணம்",
    platformFeeLabel: "தள கட்டணம்",
    totalAmountLabel: "மொத்த தொகை",
    paymentMethodLabel: "பணம் செலுத்தும் முறை",
    paymentStatusLabel: "பணம் செலுத்தும் நிலை",
    cashLabel: "பணம்",
    directPayLabel: "நேரடி பணம் செலுத்துதல்",
    paymentGatewayNotConfigured: "பணம் செலுத்தும் நுழைவாயில் கட்டமைக்கப்படவில்லை",
    paymentGatewayComingSoonBody: "ஆன்லைன் பணம் செலுத்துதல் விரைவில் வருகிறது, இந்த முன்மாதிரிக்கு பணம் அல்லது நேரடி பணம் செலுத்துதல் மூலம் உங்கள் முன்பதிவை முடிக்கவும், இரண்டும் முழுமையாக ஆதரிக்கப்படுகின்றன",
    paymentGatewayFallbackCta: "பதிலாக பணம் / நேரடி பணம் செலுத்துதலைப் பயன்படுத்தவும்",

    // Admin Services Management
    serviceSectorsMgmtTitle: "சேவை பிரிவுகள் மேலாண்மை",
    addNewServiceCategory: "புதிய சேவை வகையைச் சேர்",
    editServiceRates: "சேவை விலைகளைத் திருத்து",

    // Admin Notifications & Reports
    notificationCenterTitle: "பதிவாளர் அறிவிப்பு மையம்",
    broadcastMessage: "செய்தியை ஒளிபரப்பு",
    performanceReportsTitle: "செயல்திறன் அறிக்கைகள் & பகுப்பாய்வு",
    topPerformingSectors: "சிறந்த செயல்திறன் கொண்ட சேவை பிரிவுகள்",
    ratingDistribution: "கூட்டுறவு மதிப்பீடு பரவல்",

    // Admin Settings
    federationAdminSettingsTitle: "கூட்டமைப்பு நிர்வாகி அமைப்புகள்",
    commissionRateLabel: "கமிஷன் விகிதம்",
    dispatchTimeoutLabel: "அனுப்புதல் காலக்கெடு (வினாடிகள்)",
    poolTimeoutLabel: "பூல் காலக்கெடு (வினாடிகள்)",

    // Common Actions & Statuses (PRD-required set)
    navDashboard: "டாஷ்போர்டு",
    navMyBookings: "எனது முன்பதிவுகள்",
    navAvailableRequests: "கிடைக்கும் கோரிக்கைகள்",
    navEarnings: "வருமானம்",
    navIncentives: "ஊக்கத்தொகைகள்",
    navMap: "வரைபடம் & தேவை",
    navWelfare: "நலன்",
    navCooperative: "கூட்டுறவு",
    navProfile: "சுயவிவரம்",
    navSupport: "உதவி & ஆதரவு",
    navNotifications: "அறிவிப்புகள்",
    navSettings: "அமைப்புகள்",
    platformAdmin: "தள நிர்வாகி",
    registrarConsole: "பதிவாளர் கன்சோல்",
    actionAccept: "ஏற்றுக்கொள்",
    actionReject: "நிராகரி",
    actionEditPrice: "விலையை திருத்து",
    actionEnable: "இயக்கு",
    actionDisable: "முடக்கு",
    actionApprove: "அங்கீகரி",
    actionVerify: "சரிபார்",
    statusOffDuty: "பணியில் இல்லை",
    statusOnDuty: "பணியில்",
    statusCompleted: "முடிந்தது",
    statusAssigned: "ஒதுக்கப்பட்டது",
    statusInProgress: "செயல்பாட்டில்",
    statusCancelled: "ரத்து செய்யப்பட்டது"
  },
  bn: {
    // Global / App Shell
    appName: "ওয়ার্কসেতু",
    tagline: "পরিবার ও সম্প্রদায়ের জন্য সমবায় গিগ পরিষেবা প্ল্যাটফর্ম",
    roleSelection: "ভূমিকা নির্বাচন করুন",
    customer: "গ্রাহক",
    worker: "সমবায় কর্মী",
    admin: "প্ল্যাটফর্ম প্রশাসক",
    login: "লগ ইন",
    logout: "লগ আউট",
    register: "নিবন্ধন",
    home: "হোম",
    dashboard: "ড্যাশবোর্ড",
    myBookings: "আমার বুকিং",
    services: "পরিষেবা",
    profile: "প্রোফাইল",
    activeJob: "চলমান কাজ",
    incomingRequests: "আগত অনুরোধ",
    jobHistory: "কাজের ইতিহাস",
    theme: "থিম",
    language: "ভাষা",
    save: "সংরক্ষণ করুন",
    cancel: "বাতিল করুন",
    close: "বন্ধ করুন",
    confirm: "নিশ্চিত করুন",
    edit: "সম্পাদনা করুন",
    delete: "মুছুন",
    search: "অনুসন্ধান",
    filter: "ফিল্টার",
    all: "সব",
    viewDetails: "বিস্তারিত দেখুন",
    viewAll: "সব দেখুন",
    loading: "লোড হচ্ছে",
    noDataFound: "কোনো তথ্য পাওয়া যায়নি",

    // Landing Page
    landingTitle: "সমবায় কর্মীদের ক্ষমতায়ন, সম্প্রদায়ের সেবা",
    landingSubtitle: "গৃহস্থালি পরিষেবার জন্য স্থানীয় শ্রম সমবায় সমিতির দক্ষ, যাচাইকৃত এবং নির্ভরযোগ্য পেশাদারদের সাথে যুক্ত হন",
    getStarted: "গ্রাহক হিসেবে শুরু করুন",
    joinAsWorker: "সমবায় কর্মী হিসেবে যোগ দিন",
    whyChooseUs: "কেন ওয়ার্কসেতু বেছে নেবেন?",
    why1Title: "সমবায় সমর্থিত",
    why1Desc: "প্রতিটি কর্মী একটি নিবন্ধিত শ্রম সমবায় সমিতির প্রত্যয়িত সদস্য",
    why2Title: "কর্মী ধারাবাহিকতা",
    why2Desc: "আমাদের স্মার্ট ডিসপ্যাচ ব্যবস্থা নির্ভরযোগ্য চলমান পরিষেবার জন্য পরিচিত স্থানীয় কর্মীদের অগ্রাধিকার দেয়",
    why3Title: "ন্যায্য আয়",
    why3Desc: "সমবায় সমিতিগুলি সকল কর্মীর জন্য ন্যায্য বেতন এবং সামাজিক নিরাপত্তা সুবিধা নিশ্চিত করে",
    statsTitle: "প্ল্যাটফর্মের প্রভাব",
    statWorkers: "দক্ষ কর্মী",
    statBookings: "সম্পন্ন কাজ",
    statCooperatives: "সক্রিয় সমবায়",

    // Auth Screens
    customerLoginTitle: "গ্রাহক লগইন",
    workerLoginTitle: "কর্মী লগইন",
    adminLoginTitle: "প্রশাসক লগইন",
    emailPlaceholder: "ইমেইল বা ফোন নম্বর লিখুন",
    passwordPlaceholder: "পাসওয়ার্ড লিখুন",
    loginButton: "সাইন ইন",
    noAccount: "অ্যাকাউন্ট নেই?",
    registerLink: "এখানে নিবন্ধন করুন",
    alreadyHaveAccount: "ইতিমধ্যে অ্যাকাউন্ট আছে?",
    loginLink: "এখানে লগইন করুন",
    fullName: "পূর্ণ নাম",
    cooperativeLabel: "সমবায় সমিতি নির্বাচন করুন",
    skillLabel: "প্রধান দক্ষতা নির্বাচন করুন",
    experienceLabel: "অভিজ্ঞতার বছর",
    customerRegisterTitle: "গ্রাহক নিবন্ধন",
    workerRegisterTitle: "কর্মী নিবন্ধন",

    // Services
    servicesTitle: "একটি পরিষেবা বুক করুন",
    servicesSubtitle: "দক্ষ সমবায় কর্মী খুঁজতে নিচে একটি বিভাগ বেছে নিন",
    plumbing: "প্লাম্বিং",
    electrical: "বৈদ্যুতিক পরিষেবা",
    carpentry: "কাঠমিস্ত্রি",
    painting: "রং করা",
    caregiving: "গৃহ পরিচর্যা",
    gardening: "বাগান ও ভূদৃশ্য",
    cleaning: "ঘর পরিষ্কার",
    domesticHelp: "গৃহস্থালি সহায়তা ও রান্না",
    actionBookService: "পরিষেবা বুক করুন",

    // Service Request Form
    requestServiceTitle: "পরিষেবা অনুরোধ তৈরি করুন",
    locationLabel: "পরিষেবার স্থান / ঠিকানা",
    locationPlaceholder: "আপনার ঠিকানা লিখুন",
    descLabel: "আপনার প্রয়োজনীয়তা বর্ণনা করুন",
    descPlaceholder: "কাজের বিবরণ লিখুন, যেমন: 'রান্নাঘরের কল থেকে পানি পড়ছে এবং পাইপ পরিবর্তন করতে হবে'",
    datetimeLabel: "নির্ধারিত তারিখ ও সময়",
    urgencyLabel: "জরুরিতার মাত্রা",
    urgencyNormal: "স্বাভাবিক (24 ঘণ্টার মধ্যে)",
    urgencyUrgent: "জরুরি (2 ঘণ্টার মধ্যে)",
    estPayment: "আনুমানিক পেমেন্ট কাঠামো",
    baseRate: "মূল হার (প্রথম ঘণ্টা অন্তর্ভুক্ত)",
    hourlyRate: "ঘণ্টাপ্রতি হার (তারপর)",
    paymentEstimate: "আনুমানিক মোট (মক)",
    submitRequest: "সমবায় কর্মী খুঁজুন",

    // Matching Screens (Worker Continuity)
    findingWorkersTitle: "আপনার অনুরোধের জন্য সেরা কর্মী খোঁজা হচ্ছে",
    findingWorkersDesc: "আপনার শীর্ষ-র‍্যাঙ্কড স্থানীয় সমবায় কর্মী খুঁজতে কর্মী ধারাবাহিকতা অ্যালগরিদম প্রয়োগ করা হচ্ছে",
    topWorkersTitle: "শীর্ষ 3 উপযুক্ত সমবায় কর্মীর সাথে যোগাযোগ করা হয়েছে",
    topWorkersDesc: "এই শীর্ষ-র‍্যাঙ্কড যোগ্য কর্মীদের জানানো হয়েছে এবং একটি সংক্ষিপ্ত সাড়া দেওয়ার সময় দেওয়া হয়েছে",
    widerPoolTitle: "বৃহত্তর সমবায় পুল সক্রিয় করা হয়েছে",
    widerPoolDesc: "সাড়া দেওয়ার সময়ের মধ্যে কোনো শীর্ষ-র‍্যাঙ্কড কর্মী গ্রহণ করেননি, অনুরোধ বৃহত্তর সমবায় পুলে সম্প্রসারিত করা হয়েছে",
    nameLabel: "নাম",
    ratingLabel: "রেটিং",
    experienceValue: "{yrs} বছরের অভিজ্ঞতা",
    distanceLabel: "দূরত্ব",
    cooperativeName: "সমবায় সমিতি",
    statusLabel: "অবস্থা",
    statusWaiting: "সাড়ার জন্য অপেক্ষা করছে",
    statusAccepted: "গৃহীত ও নির্ধারিত",
    statusDeclined: "অনুপলব্ধ / ব্যস্ত",
    statusTimeout: "কোনো সাড়া নেই (সময় শেষ)",

    // Booking Confirmed & Status
    bookingConfirmedTitle: "বুকিং নিশ্চিত হয়েছে",
    bookingConfirmedDesc: "একজন সমবায় কর্মী আপনার অনুরোধ গ্রহণ করেছেন, বিস্তারিত নিচে দেখানো হয়েছে",
    assignedWorker: "নির্ধারিত কর্মী",
    contactNumber: "যোগাযোগ নম্বর",
    bookingDetails: "বুকিং বিস্তারিত",
    serviceStatusTitle: "পরিষেবা অবস্থা ট্র্যাকার",
    completeJobButton: "কাজ সম্পন্ন হিসেবে চিহ্নিত করুন",

    // Tracker Stages
    stageCreated: "অনুরোধ তৈরি হয়েছে",
    stageFinding: "কর্মী খোঁজা হচ্ছে",
    stageTop3: "শীর্ষ 3 এর সাথে যোগাযোগ করা হয়েছে",
    stageWaiting: "সাড়ার জন্য অপেক্ষা",
    stageWider: "বৃহত্তর পুল সক্রিয়",
    stageAssigned: "কর্মী নির্ধারিত",
    stageProgress: "চলমান",
    stageCompleted: "পরিষেবা সম্পন্ন",

    // Customer Bookings & Reviews
    myBookingsTitle: "আমার বুকিং ইতিহাস",
    noBookings: "কোনো বুকিং পাওয়া যায়নি",
    actionRate: "রেটিং ও পর্যালোচনা",
    rateTitle: "আপনার পরিষেবা অভিজ্ঞতা রেট করুন",
    ratingScore: "রেটিং",
    reviewPlaceholder: "সমবায় কর্মীর সাথে আপনার অভিজ্ঞতা শেয়ার করুন",
    submitReview: "পর্যালোচনা জমা দিন",
    reviewSuccess: "ধন্যবাদ, আপনার মতামত কর্মী রেটিং এবং সমবায় মেট্রিক্সকে সমর্থন করে",
    punctualityLabel: "সময়ানুবর্তিতা",
    qualityLabel: "কাজের মান",
    professionalismLabel: "পেশাদারিত্ব",
    communicationLabel: "যোগাযোগ",

    // Worker Dashboard - Home
    workerDashboardTitle: "কর্মী ড্যাশবোর্ড",
    availabilityLabel: "প্রাপ্যতার অবস্থা",
    available: "কাজের জন্য উপলব্ধ",
    busy: "ব্যস্ত / অফলাইন",
    earningsTitle: "এই মাসের আয় (মক)",
    activeJobTitle: "চলমান পরিষেবা কাজ",
    incomingTitle: "আগত কাজের অনুরোধ",
    noIncoming: "এই মুহূর্তে কোনো আগত কাজের অনুরোধ নেই",
    btnAccept: "কাজ গ্রহণ করুন",
    btnReject: "প্রত্যাখ্যান করুন",
    startJobBtn: "পরিষেবা শুরু করুন",
    completeJobBtn: "পরিষেবা শেষ করুন",
    jobHistoryTitle: "সম্পন্ন কাজের লগ",
    myOrdersLedgerTitle: "আমার অর্ডার লেজার",
    availableJobRequestsTitle: "উপলব্ধ কাজের অনুরোধ",

    // Worker Earnings & Wallet
    cooperativeEarningsTitle: "সমবায় আয়",
    walletBalance: "ওয়ালেট ব্যালেন্স",
    availableBalance: "উপলব্ধ ব্যালেন্স",
    pendingBalance: "মুলতুবি ব্যালেন্স",
    transactionHistory: "লেনদেনের ইতিহাস",
    redeemButton: "ব্যাংকে রিডিম করুন",
    redeemAmountLabel: "রিডিম পরিমাণ",
    payoutMethodLabel: "পেআউট পদ্ধতি",
    bankTransferMock: "ব্যাংক ট্রান্সফার (মক)",
    cashPickup: "নগদ সংগ্রহ",
    insufficientBalance: "রিডিমযোগ্য ব্যালেন্স অপর্যাপ্ত",
    txnStatusCompleted: "সম্পন্ন",
    txnStatusProcessing: "প্রক্রিয়াধীন",

    // Worker Incentives
    incentiveProgramsTitle: "প্রণোদনা কর্মসূচি",
    rewardLabel: "পুরস্কার",
    reasonLabel: "কারণ",
    progressLabel: "অগ্রগতি",
    targetLabel: "লক্ষ্য",
    expiryLabel: "মেয়াদ শেষ",
    incentiveStatusPending: "মুলতুবি",
    incentiveStatusCompleted: "সম্পন্ন",
    incentiveStatusExpired: "মেয়াদোত্তীর্ণ",

    // Worker Map & Demand
    demandMapTitle: "অবস্থান ও উচ্চ-চাহিদা এলাকা",
    highDemandAreas: "উচ্চ-চাহিদা এলাকা",
    openRequestsLabel: "খোলা অনুরোধ",
    zoomInBtn: "জুম ইন",
    zoomOutBtn: "জুম আউট",
    fitAllBtn: "সব ফিট করুন",

    // Worker Welfare
    welfareMonitorTitle: "কর্মী কল্যাণ মনিটর",
    hoursWorkedToday: "আজ কাজ করা ঘণ্টা",
    hoursWorkedWeek: "এই সপ্তাহে কাজ করা ঘণ্টা",
    consecutiveJobStreak: "ধারাবাহিক কাজের ধারা",
    restRecommended: "বিশ্রাম সুপারিশ করা হয়েছে",

    // Worker Cooperative
    mySocietyTitle: "আমার সমবায় সমিতি",
    memberSince: "সদস্য হয়েছেন",
    totalMembers: "মোট সদস্য",
    foundedLabel: "প্রতিষ্ঠিত",

    // Worker Help, Notifications, Settings
    helpSupportTitle: "সহায়তা ও সমর্থন",
    faqTitle: "প্রায়শই জিজ্ঞাসিত প্রশ্ন",
    contactSupport: "সহায়তার সাথে যোগাযোগ করুন",
    callSupport: "সহায়তায় কল করুন",
    emailSupport: "সহায়তায় ইমেইল করুন",
    notificationsTitle: "সদস্য বিজ্ঞপ্তি",
    markAllRead: "সব পঠিত হিসেবে চিহ্নিত করুন",
    noNotifications: "এখনও কোনো বিজ্ঞপ্তি নেই",
    interfaceSettingsTitle: "ইন্টারফেস সেটিংস",
    themeLight: "হালকা",
    themeDark: "গাঢ়",

    // Admin / Registrar Navigation
    adminNavDashboard: "ড্যাশবোর্ড",
    adminNavRequests: "পরিষেবা অনুরোধ",
    adminNavMonitoring: "ধারাবাহিকতা মনিটর",
    adminNavLiveWorkers: "লাইভ কর্মী কার্যক্রম",
    adminNavWorkers: "কর্মী তালিকা",
    adminNavCustomers: "গ্রাহক তালিকা",
    adminNavCooperatives: "সমবায় তালিকা",
    adminNavBookings: "বুকিং লেজার",
    adminNavServices: "পরিষেবা খাত",
    adminNavNotifications: "বিজ্ঞপ্তি",
    adminNavReports: "প্রতিবেদন ও বিশ্লেষণ",
    adminNavSettings: "সেটিংস",

    // Admin Dashboard
    adminDashboardTitle: "সমবায় ফেডারেশন অ্যাডমিন কনসোল",
    registrarDashboardOverview: "রেজিস্ট্রার ড্যাশবোর্ড ওভারভিউ",
    recentDispatchEvents: "সাম্প্রতিক পরিষেবা ডিসপ্যাচ ইভেন্ট",
    workerOpsSummary: "কর্মী প্রাপ্যতা ও কার্যক্রম সারাংশ",
    totalWorkers: "মোট নিবন্ধিত কর্মী",
    availableWorkers: "সক্রিয় ও উপলব্ধ কর্মী",
    totalCustomers: "নিবন্ধিত গ্রাহক",
    activeBookings: "সক্রিয় বুকিং",
    completedBookings: "সম্পন্ন বুকিং",
    totalCooperatives: "নিবন্ধিত সমবায়",
    workersTab: "কর্মী তালিকা",
    customersTab: "গ্রাহক তালিকা",
    coopsTab: "সমবায় তালিকা",
    bookingsTab: "বুকিং লেজার",
    servicesTab: "পরিষেবা সেটিংস",

    // Admin Requests & Dispatch Monitor
    serviceDispatchRequestsTitle: "পরিষেবা ডিসপ্যাচ অনুরোধ",
    continuityDispatchMonitorTitle: "কর্মী ধারাবাহিকতা ডিসপ্যাচ মনিটর",
    requestIdLabel: "অনুরোধ আইডি",
    forceReassign: "জোরপূর্বক পুনরায় নির্ধারণ",
    rejectionReasonLabel: "প্রত্যাখ্যানের কারণ",

    // Admin Live Worker Operations Map
    liveWorkerOpsTitle: "লাইভ কর্মী কার্যক্রম",
    workerStatusAvailable: "উপলব্ধ",
    workerStatusOnJob: "কাজে",
    workerStatusTravelling: "যাত্রায়",
    workerStatusOffDuty: "ডিউটিতে নেই",

    // Admin Workers / Customers / Cooperatives / Bookings Detail
    workersDirectoryTitle: "সমবায় কর্মী তালিকা",
    workerProfileTitle: "কর্মী প্রোফাইল",
    customerAccountsTitle: "নিবন্ধিত গ্রাহক অ্যাকাউন্ট",
    customerAccountTitle: "গ্রাহক অ্যাকাউন্ট",
    societiesTitle: "শ্রম সমবায় সমিতি",
    societyDetailsTitle: "সমিতির বিবরণ",
    bookingLedgerTitle: "প্ল্যাটফর্ম বুকিং লেজার",
    bookingInvoiceTitle: "বুকিং চালান",
    baseChargeLabel: "মূল চার্জ",
    platformFeeLabel: "প্ল্যাটফর্ম ফি",
    totalAmountLabel: "মোট পরিমাণ",
    paymentMethodLabel: "পেমেন্ট পদ্ধতি",
    paymentStatusLabel: "পেমেন্ট অবস্থা",
    cashLabel: "নগদ",
    directPayLabel: "ডাইরেক্ট পে",
    paymentGatewayNotConfigured: "পেমেন্ট গেটওয়ে কনফিগার করা হয়নি",
    paymentGatewayComingSoonBody: "অনলাইন পেমেন্ট শীঘ্রই আসছে, এই প্রোটোটাইপের জন্য অনুগ্রহ করে নগদ বা ডাইরেক্ট পে ব্যবহার করে আপনার বুকিং সম্পূর্ণ করুন, উভয়ই সম্পূর্ণভাবে সমর্থিত",
    paymentGatewayFallbackCta: "পরিবর্তে নগদ / ডাইরেক্ট পে ব্যবহার করুন",

    // Admin Services Management
    serviceSectorsMgmtTitle: "পরিষেবা খাত ব্যবস্থাপনা",
    addNewServiceCategory: "নতুন পরিষেবা বিভাগ যোগ করুন",
    editServiceRates: "পরিষেবার হার সম্পাদনা করুন",

    // Admin Notifications & Reports
    notificationCenterTitle: "রেজিস্ট্রার বিজ্ঞপ্তি কেন্দ্র",
    broadcastMessage: "বার্তা সম্প্রচার করুন",
    performanceReportsTitle: "পারফরম্যান্স প্রতিবেদন ও বিশ্লেষণ",
    topPerformingSectors: "শীর্ষ পারফরম্যান্সকারী পরিষেবা খাত",
    ratingDistribution: "সমবায় রেটিং বণ্টন",

    // Admin Settings
    federationAdminSettingsTitle: "ফেডারেশন অ্যাডমিন সেটিংস",
    commissionRateLabel: "কমিশন হার",
    dispatchTimeoutLabel: "ডিসপ্যাচ টাইমআউট (সেকেন্ড)",
    poolTimeoutLabel: "পুল টাইমআউট (সেকেন্ড)",

    // Common Actions & Statuses (PRD-required set)
    navDashboard: "ড্যাশবোর্ড",
    navMyBookings: "আমার বুকিং",
    navAvailableRequests: "উপলব্ধ অনুরোধ",
    navEarnings: "আয়",
    navIncentives: "প্রণোদনা",
    navMap: "মানচিত্র ও চাহিদা",
    navWelfare: "কল্যাণ",
    navCooperative: "সমবায়",
    navProfile: "প্রোফাইল",
    navSupport: "সহায়তা ও সমর্থন",
    navNotifications: "বিজ্ঞপ্তি",
    navSettings: "সেটিংস",
    platformAdmin: "প্ল্যাটফর্ম অ্যাডমিন",
    registrarConsole: "রেজিস্ট্রার কনসোল",
    actionAccept: "গ্রহণ করুন",
    actionReject: "প্রত্যাখ্যান করুন",
    actionEditPrice: "মূল্য সম্পাদনা করুন",
    actionEnable: "সক্রিয় করুন",
    actionDisable: "নিষ্ক্রিয় করুন",
    actionApprove: "অনুমোদন করুন",
    actionVerify: "যাচাই করুন",
    statusOffDuty: "ডিউটিতে নেই",
    statusOnDuty: "ডিউটিতে",
    statusCompleted: "সম্পন্ন",
    statusAssigned: "নির্ধারিত",
    statusInProgress: "চলমান",
    statusCancelled: "বাতিল"
  }
};
```

Implementation note for Claude Code Desktop: replace the body of `translations.js` with the object above, then run a project-wide search for any `t('key')` call in `index.html` whose `key` is not present in this object (all pre-existing keys are preserved, so this only surfaces genuinely new call sites) and wire the remaining hardcoded English strings identified in Section 1 to the new keys (`myOrdersLedgerTitle`, `availableJobRequestsTitle`, `cooperativeEarningsTitle`, `incentiveProgramsTitle`, `demandMapTitle`, `welfareMonitorTitle`, `mySocietyTitle`, `helpSupportTitle`, `notificationsTitle`, `interfaceSettingsTitle`, `registrarDashboardOverview`, `serviceDispatchRequestsTitle`, `continuityDispatchMonitorTitle`, `liveWorkerOpsTitle`, `workersDirectoryTitle`, `customerAccountsTitle`, `societiesTitle`, `bookingLedgerTitle`, `serviceSectorsMgmtTitle`, `notificationCenterTitle`, `performanceReportsTitle`, `federationAdminSettingsTitle`, and the modal titles `workerProfileTitle` / `customerAccountTitle` / `societyDetailsTitle` / `bookingInvoiceTitle` / `addNewServiceCategory` / `editServiceRates`).

### 2.3 i18n Production Requirements

`IMPLEMENTATION REQUIRED`.

- **No hardcoded user-facing strings.** Every string rendered in `index.html` must resolve through `t('key')` against `window.translations`. This PRD's implementation order (Section 28, step 24) treats "grep `index.html` for hardcoded English text outside a `t()` call and find zero matches" as an exit criterion, not optional cleanup.
- **Fallback language.** If `t(key)` is called with a key missing from the active locale, fall back to `en` for that key rather than rendering the raw key string or an empty value; if the key is missing from `en` too, render the key itself in a visually distinct style (dev-only warning) so missing translations are never silently blank in front of a user.
- **Persisted language preference.** The active language persists two ways: `UserPreference.language` server-side for a logged-in user (synced via `PATCH /api/v1/users/me/preferences`, already specified in Section 1.2.9) and `localStorage` client-side for pre-auth/logged-out visitors on the landing page. On login, the server value wins and overwrites the local one.
- **Localized dates, numbers, and currency.** All dates rendered to the user go through `Intl.DateTimeFormat` keyed to the active locale (`en-IN`, `hi-IN`, `ta-IN`, `bn-IN`); all currency amounts go through `Intl.NumberFormat` with `currency: 'INR'` — the platform operates in INR only, no multi-currency requirement exists. Raw ISO timestamps or unformatted floats must never reach the UI directly.
- **RTL:** not required — none of the four supported locales (EN, HI, TA, BN) are right-to-left scripts.

---

## Section 3: Comprehensive Database Schema (Prisma Schema Format)

Prisma does not ship a native `Geometry` scalar, so every spatial column is declared with `Unsupported("geometry(Point, 4326)")` — Prisma Migrate creates the column correctly, and all reads/writes/spatial filtering against it go through `$queryRaw` / `$executeRaw` using PostGIS functions (`ST_MakePoint`, `ST_DWithin`, `ST_Distance`), exactly as used in the dispatch engine in Section 4. The `postgis` extension and the `postgresqlExtensions` preview feature are enabled so `prisma migrate dev` provisions the extension automatically on a fresh Supabase database.

Save the file below as `prisma/schema.prisma` at the project root.

```prisma
// prisma/schema.prisma
// Worksetu — Cooperative Gig-Service Platform
// PostgreSQL (Supabase) + PostGIS, Prisma ORM

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [postgis]
}

// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------

enum UserRole {
  CUSTOMER
  WORKER
  ADMIN
}

enum AccountStatus {
  ACTIVE
  SUSPENDED
}

enum VerificationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ProficiencyLevel {
  BASIC
  INTERMEDIATE
  ADVANCED
}

enum WorkerAvailabilityStatus {
  AVAILABLE
  ON_JOB
  TRAVELLING
  OFF_DUTY
}

enum BookingType {
  ON_DEMAND
  SCHEDULED
}

enum UrgencyLevel {
  NORMAL
  URGENT
}

enum BookingStatus {
  REQUESTED
  DISPATCHING_TOP3
  DISPATCHING_POOL
  ASSIGNED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  SETTLED
  CANCELLED
}

enum DispatchAttempt {
  ATTEMPT_1
  ATTEMPT_2
  ATTEMPT_3
  POOL
  ADMIN_OVERRIDE
}

enum DispatchOutcome {
  OFFERED
  ACCEPTED
  DECLINED
  TIMEOUT
  LOCK_LOST
}

enum PaymentMethod {
  CASH
  DIRECT_PAY
}

enum PaymentStatus {
  PENDING
  PAID
  REFUNDED
  FAILED
}

enum CreditTransactionType {
  JOB_PAYOUT
  FEEDBACK_CREDIT
  INCENTIVE_BONUS
  REDEMPTION
  ADJUSTMENT
  REFUND
  REVERSAL
}

enum SettlementStatus {
  PENDING
  RECORDED
  RECONCILED
  DISPUTED
}

enum CreditTransactionStatus {
  PROCESSING
  COMPLETED
  FAILED
}

enum PayoutMethod {
  BANK_TRANSFER_MOCK
  CASH_PICKUP
}

enum IncentiveStatus {
  PENDING
  COMPLETED
  EXPIRED
}

enum NotificationAudience {
  USER
  ALL_WORKERS
  ALL_CUSTOMERS
  COOPERATIVE
}

enum DocumentType {
  IDENTITY_PROOF
  CERTIFICATION
  COOPERATIVE_ID
}

enum ScanStatus {
  PENDING
  CLEAN
  INFECTED
  SCAN_FAILED
}

// ---------------------------------------------------------------------------
// CORE IDENTITY
// ---------------------------------------------------------------------------

model User {
  id                   String        @id @default(uuid())
  role                 UserRole
  fullName             String
  email                String        @unique
  phone                String        @unique
  passwordHash         String
  avatarUrl            String?
  accountStatus        AccountStatus @default(ACTIVE)
  emailVerifiedAt       DateTime?
  phoneVerifiedAt       DateTime?
  /// Incremented on password change or "log out all devices" — every access
  /// token embeds the tokenVersion it was issued with; a mismatch at verify
  /// time invalidates the token even though it has not expired (Section 6.3)
  tokenVersion         Int           @default(0)
  failedLoginAttempts  Int           @default(0)
  lockedUntil          DateTime?
  lastLoginAt          DateTime?
  /// Soft delete for account-deletion privacy requests (Section 17.4). A
  /// non-null value excludes the row from all normal queries via a Prisma
  /// middleware filter; the row itself is retained for financial/audit
  /// integrity on any Booking/CreditTransaction it is referenced by
  deletedAt            DateTime?
  /// Section 17.2 — registration is refused without this being set
  acceptedTermsAt      DateTime?
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  customerProfile      CustomerProfile?
  workerProfile        WorkerProfile?
  adminProfile         AdminProfile?
  preference           UserPreference?
  notifications        Notification[]
  auditLogs            AuditLog[]         @relation("AuditActor")
  refreshTokens        RefreshToken[]
  passwordResetTokens  PasswordResetToken[]
  otpVerifications     OtpVerification[]
  idempotencyKeys      IdempotencyKey[]
  documents            Document[]

  @@index([role])
  @@index([accountStatus])
  @@index([deletedAt])
  @@map("users")
}

model UserPreference {
  id                    String   @id @default(uuid())
  userId                String   @unique
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  theme                 String   @default("LIGHT")
  language              String   @default("en")
  /// Section 18.1 — subset of "IN_APP" | "EMAIL" | "SMS" | "PUSH"; IN_APP is
  /// always effectively active regardless of this list (Section 18.1)
  notificationChannels  String[] @default(["IN_APP"])

  @@map("user_preferences")
}

model CustomerProfile {
  id             String @id @default(uuid())
  userId         String @unique
  user           User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  defaultAddress String

  /// PostGIS Point(lng, lat), SRID 4326
  defaultLocation Unsupported("geometry(Point, 4326)")?

  bookings Booking[] @relation("CustomerBookings")

  @@map("customer_profiles")
}

model AdminProfile {
  id       String  @id @default(uuid())
  userId   String  @unique
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  title    String? // e.g. "Federation Registrar"
  isSuper  Boolean @default(false)

  @@map("admin_profiles")
}

// ---------------------------------------------------------------------------
// AUTH & SESSION (Section 6) — added in Version 2.0 production hardening
// ---------------------------------------------------------------------------

model RefreshToken {
  id                String    @id @default(uuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// SHA-256 hash of the opaque refresh token — the raw token is never stored
  tokenHash         String    @unique
  issuedAt          DateTime  @default(now())
  expiresAt         DateTime
  revokedAt         DateTime?
  /// set when this token was consumed by a refresh-rotation call and replaced
  replacedByTokenId String?
  ipAddress         String?
  userAgent         String?

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model PasswordResetToken {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// SHA-256 hash of the one-time reset token — the raw token is only ever
  /// transmitted to the user, never persisted
  tokenHash  String    @unique
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime  @default(now())

  @@index([userId])
  @@map("password_reset_tokens")
}

model OtpVerification {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  channel    String   // "EMAIL" | "PHONE"
  /// bcrypt hash of the 6-digit OTP — never store the raw code
  codeHash   String
  expiresAt  DateTime
  consumedAt DateTime?
  attempts   Int      @default(0)
  createdAt  DateTime @default(now())

  @@index([userId, channel])
  @@map("otp_verifications")
}

model IdempotencyKey {
  id            String   @id @default(uuid())
  /// client-supplied Idempotency-Key header value, unique per user per route
  key           String
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  route         String
  requestHash   String   // hash of the normalized request body, to detect key reuse with a different payload
  responseCode  Int?
  responseBody  Json?
  status        String   @default("IN_PROGRESS") // IN_PROGRESS | COMPLETED
  createdAt     DateTime @default(now())
  expiresAt     DateTime // idempotency keys are retained 24h then eligible for cleanup

  @@unique([userId, route, key])
  @@index([expiresAt])
  @@map("idempotency_keys")
}

// ---------------------------------------------------------------------------
// COOPERATIVES & WORKERS
// ---------------------------------------------------------------------------

model Cooperative {
  id                 String   @id @default(uuid())
  name               String
  location           String
  registrationNumber String   @unique
  members            Int      @default(0)
  founded            Int
  createdAt          DateTime @default(now())

  workers WorkerProfile[]

  @@map("cooperatives")
}

model WorkerProfile {
  id                   String                    @id @default(uuid())
  userId               String                    @unique
  user                 User                      @relation(fields: [userId], references: [id], onDelete: Cascade)
  cooperativeId        String
  cooperative          Cooperative               @relation(fields: [cooperativeId], references: [id])
  experienceYears      Int                       @default(0)
  serviceAreaRadiusKm  Float                     @default(5)
  verificationStatus   VerificationStatus        @default(PENDING)
  rejectionReason      String?
  approvedAt           DateTime?
  approvedByAdminId    String?
  availabilityStatus   WorkerAvailabilityStatus  @default(OFF_DUTY)
  ratingAverage        Float                     @default(0)
  ratingCount          Int                       @default(0)
  currentBookingId     String?
  /// Section 15.1 — set by admin suspension; while non-null the worker
  /// cannot toggle availabilityStatus back to AVAILABLE
  suspendedAt          DateTime?

  /// PostGIS Point(lng, lat), SRID 4326 — worker's registered home base
  homeLocation Unsupported("geometry(Point, 4326)")?

  /// PostGIS Point(lng, lat), SRID 4326 — most recent live GPS ping
  currentLocation Unsupported("geometry(Point, 4326)")?
  lastLocationAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  skills            WorkerSkill[]
  assignedBookings  Booking[]           @relation("AssignedWorker")
  dispatchLogs      DispatchLog[]
  reviews           Review[]            @relation("WorkerReviews")
  creditTransactions CreditTransaction[]
  incentiveProgress IncentiveProgress[]
  feedbackCredit    FeedbackCredit?

  @@index([verificationStatus])
  @@index([availabilityStatus])
  @@index([cooperativeId])
  /// covers the dispatch-engine hot path: WHERE verificationStatus = APPROVED AND availabilityStatus = AVAILABLE
  @@index([verificationStatus, availabilityStatus])
  @@map("worker_profiles")
}

model SkillCategory {
  id             String   @id // matches ServiceCategory.id, e.g. "plumbing"
  translationKey String
  createdAt      DateTime @default(now())

  workerSkills WorkerSkill[]

  @@map("skill_categories")
}

model WorkerSkill {
  id                 String              @id @default(uuid())
  workerProfileId    String
  workerProfile      WorkerProfile       @relation(fields: [workerProfileId], references: [id], onDelete: Cascade)
  skillCategoryId    String
  skillCategory      SkillCategory       @relation(fields: [skillCategoryId], references: [id])
  proficiencyLevel   ProficiencyLevel    @default(BASIC)
  verificationStatus VerificationStatus  @default(PENDING)
  isPrimary          Boolean             @default(false)
  createdAt          DateTime            @default(now())

  certifications Certification[]

  @@unique([workerProfileId, skillCategoryId])
  @@index([skillCategoryId])
  @@index([skillCategoryId, verificationStatus])
  @@map("worker_skills")
}

model Certification {
  id            String      @id @default(uuid())
  workerSkillId String
  workerSkill   WorkerSkill @relation(fields: [workerSkillId], references: [id], onDelete: Cascade)
  title         String
  issuingBody   String?
  /// Section 16.1 — a private, signed-URL-only Document row, never a raw URL
  documentId    String
  document      Document    @relation(fields: [documentId], references: [id])
  issuedAt      DateTime?
  expiresAt     DateTime?
  verifiedAt    DateTime?

  @@map("certifications")
}

/// Section 16 — private-bucket storage reference for identity and
/// certification documents. Never holds a public or permanent URL.
model Document {
  id               String       @id @default(uuid())
  ownerUserId      String
  owner            User         @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  documentType     DocumentType
  /// server-generated random key, e.g. documents/{uuid}.pdf — never derived
  /// from the user-supplied filename (Section 16.3)
  storageKey       String       @unique
  originalFilename String
  mimeType         String
  sizeBytes        Int
  scanStatus       ScanStatus   @default(PENDING)
  uploadedAt       DateTime     @default(now())
  expiresAt        DateTime?
  deletedAt        DateTime?

  certifications Certification[]

  @@index([ownerUserId])
  @@index([scanStatus])
  @@map("documents")
}

// ---------------------------------------------------------------------------
// SERVICE CATALOG
// ---------------------------------------------------------------------------

model ServiceCategory {
  id             String   @id // "plumbing", "electrical", ...
  translationKey String
  baseRate       Decimal  @db.Decimal(10, 2)
  hourlyRate     Decimal  @db.Decimal(10, 2)
  icon           String
  isEnabled      Boolean  @default(true)
  sortOrder      Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  bookings Booking[]

  @@map("service_categories")
}

// ---------------------------------------------------------------------------
// BOOKING & DISPATCH
// ---------------------------------------------------------------------------

model Booking {
  id                String        @id @default(uuid())
  customerId        String
  customer          CustomerProfile @relation("CustomerBookings", fields: [customerId], references: [id])
  serviceCategoryId String
  serviceCategory   ServiceCategory @relation(fields: [serviceCategoryId], references: [id])
  type              BookingType   @default(ON_DEMAND)
  description       String
  address           String

  /// PostGIS Point(lng, lat), SRID 4326 — job site location
  customerLocation Unsupported("geometry(Point, 4326)")

  scheduledAt   DateTime?
  urgency       UrgencyLevel  @default(NORMAL)
  baseCharge    Decimal       @db.Decimal(10, 2)
  hourlyRate    Decimal       @db.Decimal(10, 2)
  estimatedTotal Decimal      @db.Decimal(10, 2)
  status        BookingStatus @default(REQUESTED)

  assignedWorkerId String?
  assignedWorker   WorkerProfile? @relation("AssignedWorker", fields: [assignedWorkerId], references: [id])

  /// Redis-mirrored lock expiry persisted for audit/recovery — the live lock of record is Redis
  lockExpiresAt DateTime?

  /// Optimistic-concurrency guard, defense-in-depth alongside the Redis lock
  /// (Section 11.2): every status-changing UPDATE includes WHERE version = :expected
  /// and SET version = version + 1; a zero-row update means a concurrent writer won
  version Int @default(0)

  confirmedAt DateTime?
  startedAt   DateTime?
  completedAt DateTime?
  settledAt   DateTime?
  cancelledAt DateTime?
  cancelReason String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  dispatchLogs DispatchLog[]
  invoice      Invoice?
  review       Review?

  @@index([status])
  @@index([assignedWorkerId])
  @@index([customerId])
  @@index([serviceCategoryId])
  @@map("bookings")
}

model DispatchLog {
  id              String           @id @default(uuid())
  bookingId       String
  booking         Booking          @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  workerId        String
  worker          WorkerProfile    @relation(fields: [workerId], references: [id])
  attemptNumber   DispatchAttempt
  distanceKm      Float
  continuityScore Float
  offeredAt       DateTime         @default(now())
  respondedAt     DateTime?
  outcome         DispatchOutcome  @default(OFFERED)

  @@index([bookingId])
  @@index([workerId])
  /// covers the timeout-sweep query in Section 11.4 (find OFFERED rows past their expiry)
  @@index([outcome, offeredAt])
  @@map("dispatch_logs")
}

// ---------------------------------------------------------------------------
// PAYMENTS — NATIVE WALLET / CASH / DIRECT-PAY ONLY (NO RAZORPAY)
// ---------------------------------------------------------------------------

model Invoice {
  id            String        @id @default(uuid())
  bookingId     String        @unique
  booking       Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  baseCharge    Decimal       @db.Decimal(10, 2)
  hoursBilled   Decimal       @db.Decimal(6, 2) @default(1)
  hourlyCharge  Decimal       @db.Decimal(10, 2)
  platformFee   Decimal       @db.Decimal(10, 2)
  totalAmount   Decimal       @db.Decimal(10, 2)
  createdAt     DateTime      @default(now())

  paymentTransaction PaymentTransaction?

  @@map("invoices")
}

model PaymentTransaction {
  id            String        @id @default(uuid())
  invoiceId     String        @unique
  invoice       Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  paymentMethod PaymentMethod
  paymentStatus PaymentStatus @default(PENDING)
  amount        Decimal       @db.Decimal(10, 2)
  processedAt   DateTime?
  refundedAt    DateTime?
  refundReason  String?
  refundedByAdminId String?
  createdAt     DateTime      @default(now())

  @@index([paymentStatus])
  @@map("payment_transactions")
}

// ---------------------------------------------------------------------------
// REVIEWS & FEEDBACK CREDIT ENGINE
// ---------------------------------------------------------------------------

model Review {
  id               String   @id @default(uuid())
  bookingId        String   @unique
  booking          Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  customerId       String
  workerId         String
  worker           WorkerProfile @relation("WorkerReviews", fields: [workerId], references: [id])
  punctuality      Int      // 1-5
  quality          Int      // 1-5
  professionalism  Int      // 1-5
  communication    Int      // 1-5
  overallScore     Float    // average of the four dimensions, 1.00-5.00
  writtenFeedback  String?
  createdAt        DateTime @default(now())

  @@index([workerId])
  @@map("reviews")
}

model FeedbackCredit {
  id                  String        @id @default(uuid())
  workerProfileId     String        @unique
  workerProfile       WorkerProfile @relation(fields: [workerProfileId], references: [id], onDelete: Cascade)
  commissionPoolTotal Decimal       @db.Decimal(12, 2) @default(0)
  distributedTotal    Decimal       @db.Decimal(12, 2) @default(0)
  updatedAt           DateTime      @updatedAt

  @@map("feedback_credits")
}

model CreditTransaction {
  id              String                   @id @default(uuid())
  workerProfileId String
  workerProfile   WorkerProfile            @relation(fields: [workerProfileId], references: [id], onDelete: Cascade)
  type            CreditTransactionType
  amount          Decimal                  @db.Decimal(10, 2)
  status          CreditTransactionStatus  @default(PROCESSING)
  payoutMethod    PayoutMethod?
  referenceBookingId String?
  /// links a REVERSAL/REFUND row back to the transaction it reverses — null for original entries
  reversesTransactionId String?
  /// client-supplied idempotency key echo (Section 8.4) — prevents duplicate ledger writes on request retry
  idempotencyKey  String?                  @unique
  createdAt       DateTime                 @default(now())
  settledAt       DateTime?

  settlementRecord SettlementRecord?

  @@index([workerProfileId])
  @@index([status])
  @@map("credit_transactions")
}

model SettlementRecord {
  id                    String           @id @default(uuid())
  creditTransactionId   String           @unique
  creditTransaction     CreditTransaction @relation(fields: [creditTransactionId], references: [id], onDelete: Cascade)
  payoutMethod          PayoutMethod
  /// admin-entered manual reference (mock bank UTR, cash-pickup receipt number) — free text, never validated against a real bank API
  externalReferenceNote String?
  status                SettlementStatus @default(PENDING)
  recordedByAdminId     String
  recordedAt            DateTime         @default(now())
  reconciledByAdminId   String?
  reconciledAt          DateTime?

  @@index([status])
  @@map("settlement_records")
}

model IncentiveProgress {
  id              String          @id @default(uuid())
  workerProfileId String
  workerProfile   WorkerProfile   @relation(fields: [workerProfileId], references: [id], onDelete: Cascade)
  title           String
  reward          Decimal         @db.Decimal(10, 2)
  reason          String
  progress        Int             @default(0)
  target          Int
  expiry          DateTime
  status          IncentiveStatus @default(PENDING)

  @@index([workerProfileId])
  @@map("incentive_progress")
}

// ---------------------------------------------------------------------------
// PLATFORM OPERATIONS
// ---------------------------------------------------------------------------

model Notification {
  id        String               @id @default(uuid())
  userId    String?
  user      User?                @relation(fields: [userId], references: [id], onDelete: Cascade)
  audience  NotificationAudience @default(USER)
  title     String
  body      String
  isRead    Boolean              @default(false)
  createdAt DateTime             @default(now())

  @@index([userId])
  @@index([audience])
  /// covers "unread count" / "unread feed" queries (Section 18)
  @@index([userId, isRead])
  @@map("notifications")
}

model PlatformConfig {
  id                  Int      @id @default(1)
  commissionPercent   Decimal  @db.Decimal(5, 2) @default(15.00)
  top3TimeoutSeconds  Int      @default(45)
  poolTimeoutSeconds  Int      @default(120)
  updatedAt           DateTime @updatedAt

  @@map("platform_config")
}

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String?
  actor      User?    @relation("AuditActor", fields: [actorId], references: [id])
  action     String
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([action])
  @@map("audit_logs")
}
```

### 3.1 Post-Migration Raw SQL (spatial indexes)

`prisma migrate dev` creates the `geometry` columns declared with `Unsupported(...)` but does not know how to express a `GIST` index in the Prisma schema language, so the spatial indexes are added in a follow-up SQL migration (`prisma/migrations/<timestamp>_spatial_indexes/migration.sql`):

```sql
CREATE INDEX IF NOT EXISTS idx_worker_home_location
  ON worker_profiles USING GIST (home_location);

CREATE INDEX IF NOT EXISTS idx_worker_current_location
  ON worker_profiles USING GIST (current_location);

CREATE INDEX IF NOT EXISTS idx_booking_customer_location
  ON bookings USING GIST (customer_location);
```

Note: because the Prisma model fields use `@@map` on every model but the column names inside `Unsupported(...)` fields follow Prisma's default snake_case-from-camelCase mapping only when a `@map` is added per field, the actual migration generated by `prisma migrate dev --create-only` should be inspected once and the exact generated column identifiers (`homeLocation` vs `home_location`) copied into this follow-up SQL file before applying it.

### 3.2 Per-Model Constraint and Index Audit

`SPECIFICATION COMPLETE`. Every model above already declares its `@id`, `@unique`, `@@index`, nullability, and timestamps inline; this table is the audit checklist Claude Code runs against the schema before the first migration, confirming each requirement from the production checklist is actually present.

| Model | PK | FK(s) | Unique constraint(s) | Key indexes | Nullable fields (intentional) | Timestamps | Soft delete | Cascade behavior |
|---|---|---|---|---|---|---|---|---|
| User | `id` (uuid) | — | `email`, `phone` | role, accountStatus, deletedAt | avatarUrl, lastLoginAt, deletedAt, emailVerifiedAt, phoneVerifiedAt, lockedUntil, acceptedTermsAt | createdAt, updatedAt | Yes (`deletedAt`) | children (`*Profile`, tokens) cascade-delete on hard delete only; soft delete never cascades |
| CustomerProfile | `id` | `userId` → User | `userId` | — | defaultLocation (until first booking) | — | No (deletes with User) | `onDelete: Cascade` from User |
| WorkerProfile | `id` | `userId` → User, `cooperativeId` → Cooperative | `userId` | verificationStatus, availabilityStatus, cooperativeId, composite (verificationStatus, availabilityStatus) | rejectionReason, currentLocation, currentBookingId, suspendedAt | createdAt, updatedAt | No (deletes with User; `verificationStatus = REJECTED` and `suspendedAt` non-null are the terminal/blocked non-delete states, Section 15.1) | `onDelete: Cascade` from User; `Restrict` implied on Cooperative (no `onDelete` set — deleting a Cooperative with active workers must fail, see 3.4) |
| Cooperative | `id` | — | `registrationNumber` | — | — | createdAt | No | referenced by WorkerProfile without cascade — see 3.4 |
| SkillCategory | `id` (string, matches ServiceCategory.id) | — | `id` is PK | — | — | createdAt | No | referenced by WorkerSkill without cascade |
| WorkerSkill | `id` | `workerProfileId`, `skillCategoryId` | composite (`workerProfileId`,`skillCategoryId`) | skillCategoryId, composite (skillCategoryId, verificationStatus) | — | createdAt | No | `onDelete: Cascade` from WorkerProfile |
| Certification | `id` | `workerSkillId`, `documentId` → Document | — | — | issuingBody, issuedAt, expiresAt, verifiedAt | — | No | `onDelete: Cascade` from WorkerSkill; `Restrict` on Document (a Document referenced by a Certification is never hard-deleted while the certification exists, per Section 16.8) |
| Document | `id` | `ownerUserId` → User | `storageKey` | ownerUserId, scanStatus | expiresAt, deletedAt | uploadedAt | Yes (`deletedAt`, Section 16.8) | `onDelete: Cascade` from User |
| ServiceCategory | `id` (string) | — | `id` is PK | — | — | createdAt, updatedAt | No (`isEnabled = false` is the soft-disable state) | referenced by Booking without cascade — must never hard-delete a category with historical bookings |
| Booking | `id` | `customerId`, `serviceCategoryId`, `assignedWorkerId` | — | status, assignedWorkerId, customerId, serviceCategoryId | scheduledAt, assignedWorkerId, lockExpiresAt, confirmed/started/completed/settled/cancelledAt, cancelReason | createdAt, updatedAt | No (CANCELLED is terminal; bookings are never deleted, only status-terminated) | `Restrict` on customer/service/worker FKs — never cascade-delete a Booking |
| DispatchLog | `id` | `bookingId`, `workerId` | — | bookingId, workerId, composite (outcome, offeredAt) | respondedAt | offeredAt | No | `onDelete: Cascade` from Booking |
| Invoice | `id` | `bookingId` | `bookingId` | — | — | createdAt | No | `onDelete: Cascade` from Booking |
| PaymentTransaction | `id` | `invoiceId` | `invoiceId` | paymentStatus | processedAt, refundedAt, refundReason, refundedByAdminId | createdAt | No | `onDelete: Cascade` from Invoice |
| Review | `id` | `bookingId`, `workerId` | `bookingId` | workerId | writtenFeedback | createdAt | No (reviews are immutable once submitted, no edit endpoint exists) | `onDelete: Cascade` from Booking |
| FeedbackCredit | `id` | `workerProfileId` | `workerProfileId` | — | — | updatedAt | No | `onDelete: Cascade` from WorkerProfile |
| CreditTransaction | `id` | `workerProfileId` | `idempotencyKey` | workerProfileId, status | referenceBookingId, reversesTransactionId, idempotencyKey, settledAt | createdAt | No — rows are append-only/immutable, corrections are new REVERSAL/REFUND rows, never UPDATE or DELETE of an existing amount | `onDelete: Cascade` from WorkerProfile |
| SettlementRecord | `id` | `creditTransactionId` | `creditTransactionId` | status | externalReferenceNote, reconciledByAdminId, reconciledAt | recordedAt | No | `onDelete: Cascade` from CreditTransaction |
| IncentiveProgress | `id` | `workerProfileId` | — | workerProfileId | — | — | No | `onDelete: Cascade` from WorkerProfile |
| Notification | `id` | `userId` (nullable for broadcast) | — | userId, audience, composite (userId, isRead) | userId (null = broadcast, resolved to per-user rows by the fan-out worker, Section 18) | createdAt | No | `onDelete: Cascade` from User when userId is set |
| PlatformConfig | `id` (fixed `1`) | — | singleton by convention | — | — | updatedAt | No | n/a, single row |
| AuditLog | `id` | `actorId` (nullable — system-initiated events) | — | composite (entityType, entityId), action | actorId, metadata | createdAt | No — audit rows are immutable and never deleted by application code (retention handled by Section 17.5 policy, not by app-level delete) | `SetNull` implied on actor deletion (no `onDelete` set — actorId must survive user hard-deletion for audit integrity; do not cascade) |
| RefreshToken / PasswordResetToken / OtpVerification | `id` | `userId` | tokenHash unique | userId, expiresAt | revokedAt, replacedByTokenId | issuedAt/createdAt | No (revocation is a field, not a delete) | `onDelete: Cascade` from User |
| IdempotencyKey | `id` | `userId` | composite (`userId`,`route`,`key`) | expiresAt | responseCode, responseBody | createdAt | No (expired rows are reaped by a cleanup job, Section 21.5, not soft-deleted) | `onDelete: Cascade` from User |

### 3.3 Transaction, Concurrency, and Query-Safety Requirements

`IMPLEMENTATION REQUIRED`.

1. **PostgreSQL is the sole durable source of truth.** Redis holds only coordination state (booking-accept locks, Section 11.2) and cache (service catalog, platform stats). Any value in Redis must be reconstructable from PostgreSQL; nothing is ever written to Redis without also being durably written, or about to be written, to Postgres. If Redis is unavailable, the system degrades (dispatch pauses, caches miss to a live query) — it never silently trusts stale or synthesized Redis state as ground truth.
2. **Every multi-row financial or state-machine mutation runs inside a single `prisma.$transaction`.** This is already true of every controller shown in Section 4; the requirement here is that this pattern is non-negotiable for every new mutation added later (admin adjustments, refunds, reversals) — a financial mutation that touches more than one row outside a transaction is a defect.
3. **Server computes every total; the client is never trusted.** `baseCharge`, `hourlyRate`, `estimatedTotal`, `platformFee`, and `totalAmount` are read from `ServiceCategory`/`PlatformConfig` and computed server-side (already true in Section 4.3 and 4.5). Any request body field that looks like a price, fee, or total is ignored if present and never read into a financial calculation.
4. **No N+1 queries.** Every list endpoint that returns related entities (bookings with worker/customer summary, dispatch logs with worker names, admin directories with cooperative names) uses Prisma `include`/`select` to fetch relations in the same query, not a loop of per-row queries. Section 27 includes a worked example.
5. **Pagination is mandatory and capped.** Every list endpoint accepts `page` (default 1) and `pageSize` (default 20, max 100 — requests above 100 are clamped, not rejected) and returns `{ items, page, pageSize, totalCount, totalPages }`. An endpoint returning an unbounded array is a defect. This applies retroactively to every list endpoint in Section 4.2 that did not show pagination params explicitly.
6. **Migration safety.** Every `prisma migrate dev` migration that adds a `NOT NULL` column to a table that can already have rows (any model beyond the very first migration) must either (a) add the column nullable first, backfill, then a follow-up migration adds the `NOT NULL` constraint, or (b) supply a `@default(...)` so existing rows populate automatically. A migration that would fail against non-empty staging data is rejected in CI (Section 21.4) before it reaches production.

### 3.4 Referential Integrity Notes (Restrict, Not Cascade)

Three relationships intentionally omit `onDelete: Cascade` because cascading would silently destroy financial or operational history:

- **Cooperative → WorkerProfile:** deleting a Cooperative with any non-deleted WorkerProfile must be rejected at the application layer (`DELETE /api/v1/admin/cooperatives/:id` returns `409 COOPERATIVE_HAS_ACTIVE_WORKERS` — no such endpoint currently exists in Section 4.2 and none is added; cooperatives are never deleted in this system, only edited, matching the existing "onboard/edit" admin workflow).
- **ServiceCategory → Booking:** a service category with historical bookings is disabled (`isEnabled = false`), never deleted; the schema has no `DELETE /api/v1/admin/services/:id` endpoint and none should be added.
- **AuditLog → User (actor):** if a User is hard-deleted (Section 17.4 export/erasure flow, which is rare and admin-only), `AuditLog.actorId` is left pointing at the now-nonexistent id rather than nulled or cascaded, preserving the historical record; the audit reader resolves a dangling `actorId` to a display label of "deleted user" rather than failing.

---

## Section 4: Detailed API Contract Matrix and Engine Algorithms

### 4.1 Auth Guards

Three JWT guards wrap every non-public route, implemented as Express middleware in `src/middleware/auth.ts`:

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: "CUSTOMER" | "WORKER" | "ADMIN" };
}

const JWT_SECRET = process.env.JWT_SECRET as string;

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export function requireAuth(...allowedRoles: Array<"CUSTOMER" | "WORKER" | "ADMIN">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "MISSING_TOKEN" });
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
      if (!allowedRoles.includes(payload.role as any)) {
        return res.status(403).json({ error: "FORBIDDEN_ROLE" });
      }
      req.user = { id: payload.sub, role: payload.role as any };
      next();
    } catch {
      return res.status(401).json({ error: "INVALID_TOKEN" });
    }
  };
}

export const requireCustomer = requireAuth("CUSTOMER");
export const requireProvider = requireAuth("WORKER");
export const requireAdmin = requireAuth("ADMIN");
```

### 4.2 Full Route Matrix

| Method & Route | Auth Guard | Purpose |
|---|---|---|
| `POST /api/v1/auth/customer/register` | Public | Customer registration |
| `POST /api/v1/auth/customer/login` | Public | Customer login |
| `POST /api/v1/auth/worker/register` | Public | Worker registration (creates `WorkerProfile` as `PENDING`) |
| `POST /api/v1/auth/worker/login` | Public | Worker login |
| `POST /api/v1/auth/admin/login` | Public | Admin login |
| `POST /api/v1/auth/refresh` | Public (httpOnly refresh cookie, Section 6.1) | Rotate access token, with reuse detection (Section 6.3) |
| `GET /api/v1/public/stats` | Public | Landing page platform stats |
| `GET /api/v1/services` | Public | Enabled service catalog |
| `GET /api/v1/cooperatives/:id` | JWT Customer/Provider | Cooperative profile card |
| `PATCH /api/v1/users/me` | JWT Customer/Provider/Admin | Edit own profile |
| `PATCH /api/v1/users/me/preferences` | JWT Customer/Provider/Admin | Theme/language sync |
| `GET /api/v1/notifications` | JWT Customer/Provider/Admin | Own notification feed |
| `PATCH /api/v1/notifications/:id/read` | JWT Customer/Provider/Admin | Mark one read |
| `PATCH /api/v1/notifications/read-all` | JWT Customer/Provider/Admin | Mark all read |
| `POST /api/v1/bookings/request` | JWT Customer | Create a service request, enters `REQUESTED` |
| `GET /api/v1/bookings/:id` | JWT Customer/Provider | Booking detail + timeline |
| `GET /api/v1/customers/me/bookings` | JWT Customer | Booking history |
| `POST /api/v1/bookings/:id/review` | JWT Customer | Submit rating, triggers settlement |
| `POST /api/v1/bookings/:id/payment-method` | JWT Customer | Record `CASH`/`DIRECT_PAY`, or return `501 PAYMENT_GATEWAY_NOT_CONFIGURED` for `GATEWAY` (Section 14.7, added in the Version 3.0 pass) |
| `POST /api/v1/bookings/:id/cancel` | JWT Customer | Cancel before `IN_PROGRESS` |
| `GET /api/v1/dispatch/:bookingId/candidates` | JWT Customer | Poll fallback if socket disconnects |
| `POST /api/v1/dispatch/:dispatchLogId/respond` | JWT Provider | Worker accepts/declines an offer |
| `PATCH /api/v1/workers/me/availability` | JWT Provider | Toggle `AVAILABLE` / `OFF_DUTY` |
| `GET /api/v1/workers/me/incoming` | JWT Provider | Pending offers |
| `GET /api/v1/workers/me/bookings` | JWT Provider | Worker's booking history |
| `PATCH /api/v1/bookings/:id/start` | JWT Provider | `CONFIRMED -> IN_PROGRESS` |
| `PATCH /api/v1/bookings/:id/complete` | JWT Provider | `IN_PROGRESS -> COMPLETED` |
| `GET /api/v1/workers/me/wallet` | JWT Provider | Wallet balance + ledger |
| `POST /api/v1/workers/me/wallet/redeem` | JWT Provider | Redeem to bank/cash |
| `GET /api/v1/workers/me/incentives` | JWT Provider | Incentive program progress |
| `GET /api/v1/workers/me/demand-heatmap` | JWT Provider | High-demand area clusters |
| `GET /api/v1/workers/me/welfare` | JWT Provider | Working-hours welfare snapshot |
| `POST /api/v1/workers/location-ping` | JWT Provider | Live GPS ping (debounced) |
| `GET /api/v1/admin/dashboard/summary` | JWT Admin | Registrar dashboard tiles |
| `GET /api/v1/admin/bookings` | JWT Admin | Dispatch requests table |
| `GET /api/v1/admin/bookings/:id/dispatch-log` | JWT Admin | Per-booking `DispatchLog[]` |
| `POST /api/v1/admin/bookings/:id/force-assign` | JWT Admin | Manual override assignment |
| `GET /api/v1/admin/dispatch/active` | JWT Admin | Continuity Dispatch Monitor feed |
| `GET /api/v1/admin/live/workers` | JWT Admin | Live Worker Operations snapshot |
| `GET /api/v1/admin/workers` | JWT Admin | Workers directory |
| `PATCH /api/v1/admin/workers/:id/verify` | JWT Admin | Approve/reject worker identity |
| `PATCH /api/v1/admin/workers/:id/skills/:skillId/verify` | JWT Admin | Approve/reject a skill/certification |
| `GET /api/v1/admin/customers` | JWT Admin | Customer accounts directory |
| `PATCH /api/v1/admin/customers/:id/status` | JWT Admin | Suspend/reactivate customer |
| `GET /api/v1/admin/cooperatives` | JWT Admin | Cooperative societies list |
| `POST /api/v1/admin/cooperatives` | JWT Admin | Onboard a new cooperative |
| `GET /api/v1/admin/cooperatives/:id` | JWT Admin | Cooperative detail with job counts |
| `GET /api/v1/admin/bookings/ledger` | JWT Admin | Full booking + payment ledger |
| `GET /api/v1/admin/bookings/:id/invoice` | JWT Admin | Invoice detail |
| `POST /api/v1/admin/services` | JWT Admin | Add a new service category |
| `PATCH /api/v1/admin/services/:id` | JWT Admin | Edit rates / enable / disable |
| `POST /api/v1/admin/notifications/broadcast` | JWT Admin | Fan-out notification |
| `GET /api/v1/admin/reports/top-sectors` | JWT Admin | Top performing sectors |
| `GET /api/v1/admin/reports/rating-distribution` | JWT Admin | Cooperative rating distribution |
| `GET /api/v1/admin/config` | JWT Admin | Read platform config |
| `PATCH /api/v1/admin/config` | JWT Admin | Update commission/timeout config (`isSuper` only, Section 15.6) |
| `PATCH /api/v1/admin/wallet/redemptions/:transactionId/settle` | JWT Admin | Record manual settlement of a redemption (Section 14.4) |
| `POST /api/v1/admin/bookings/:id/refund` | JWT Admin | Record a refund and reverse the worker payout ledger entry (Section 14.5) |
| `GET /api/v1/admin/reports/reconciliation` | JWT Admin | Pending vs. reconciled settlements and payment exceptions (Section 14.6) |
| `PATCH /api/v1/admin/wallet/settlements/:id/reconcile` | JWT Admin | Mark a settlement reconciled against real-world records (Section 14.6) |
| `POST /api/v1/admin/wallet/adjustments` | JWT Admin | Manual credit/debit not tied to a booking (Section 13.2, 15.5) |
| `POST /api/v1/admin/credit-transactions/:id/reversal` | JWT Admin | Reverse a fraudulent or erroneous ledger entry (Section 13.2, 15.7) |
| `GET /api/v1/admin/audit-logs` | JWT Admin | Query the immutable audit trail (Section 15.8) |
| `POST /api/v1/admin/demo/reset` | JWT Admin (`isSuper`) | Re-seed the demo dataset on demand (Section 15.9, added in the Version 3.0 pass) |
| `POST /api/v1/auth/logout` | JWT Customer/Provider/Admin | Revoke current refresh token (Section 6.4) |
| `POST /api/v1/auth/logout-all` | JWT Customer/Provider/Admin | Revoke all sessions (Section 6.4) |
| `POST /api/v1/auth/password-reset/request` | Public | Request password reset (Section 6.5) |
| `POST /api/v1/auth/password-reset/confirm` | Public | Confirm password reset (Section 6.5) |
| `POST /api/v1/auth/verify-otp` | JWT Customer/Provider/Admin | Confirm email/phone OTP (Section 6.5) |
| `POST /api/v1/workers/documents` | JWT Provider | Upload a KYC/certification document (Section 16) |
| `GET /api/v1/workers/documents/:id/signed-url` | JWT Provider/Admin | Get a short-lived signed URL for a private document (Section 16.5) |

### 4.3 Booking Request Controller

```typescript
// src/controllers/booking.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { enqueueDispatch } from "../services/dispatch.service";

const requestBookingSchema = z.object({
  serviceCategoryId: z.string().min(1),
  location: z.object({
    address: z.string().min(5).max(200),
    lat: z.number().min(6.0).max(37.5),
    lng: z.number().min(68.0).max(97.5)
  }),
  description: z.string().min(10).max(500),
  scheduledAt: z.string().datetime().nullable(),
  urgency: z.enum(["NORMAL", "URGENT"])
});

export async function requestBooking(req: AuthenticatedRequest, res: Response) {
  const parsed = requestBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: parsed.error.flatten() });
  }
  const { serviceCategoryId, location, description, scheduledAt, urgency } = parsed.data;

  const service = await prisma.serviceCategory.findUnique({ where: { id: serviceCategoryId } });
  if (!service || !service.isEnabled) {
    return res.status(404).json({ error: "SERVICE_NOT_FOUND" });
  }

  const customerProfile = await prisma.customerProfile.findUnique({
    where: { userId: req.user!.id }
  });
  if (!customerProfile) {
    return res.status(404).json({ error: "CUSTOMER_PROFILE_NOT_FOUND" });
  }

  const estimatedTotal = Number(service.baseRate) + Number(service.hourlyRate);

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO bookings (
        id, "customerId", "serviceCategoryId", type, description, address,
        "customerLocation", "scheduledAt", urgency, "baseCharge", "hourlyRate",
        "estimatedTotal", status, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${customerProfile.id}, ${serviceCategoryId},
        ${scheduledAt ? "SCHEDULED" : "ON_DEMAND"}::"BookingType", ${description}, ${location.address},
        ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326),
        ${scheduledAt}, ${urgency}::"UrgencyLevel", ${service.baseRate}, ${service.hourlyRate},
        ${estimatedTotal}, 'REQUESTED'::"BookingStatus", now(), now()
      )
      RETURNING id
    `;
    const bookingId = created[0].id;

    await tx.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "BOOKING_CREATED",
        entityType: "Booking",
        entityId: bookingId,
        metadata: { serviceCategoryId, urgency }
      }
    });

    return bookingId;
  });

  await enqueueDispatch(booking);

  return res.status(201).json({ bookingId: booking, status: "REQUESTED", estimatedTotal });
}
```

### 4.4 WOW Factor 1 — Multi-Level Worker Continuity Dispatch Engine

The engine has three layers: a PostGIS continuity-scoring query that ranks candidate workers, an atomic Redis lock that guarantees only one worker can hold an active offer on a booking at a time, and a sequential 45-second-per-candidate timeout queue that escalates from the top-3 continuity ranking to the wider cooperative pool.

#### 4.4.1 Continuity Scoring Query

Continuity score rewards (a) prior completed jobs with this exact customer (worker continuity), (b) proximity, and (c) rating — in that priority order, matching the "familiar local workers" promise on the landing page (`why2Desc`).

```typescript
// src/services/continuity-scoring.service.ts
import { prisma } from "../lib/prisma";

export interface CandidateWorker {
  workerId: string;
  distanceKm: number;
  ratingAverage: number;
  priorJobsWithCustomer: number;
  continuityScore: number;
}

export async function scoreCandidateWorkers(params: {
  serviceCategoryId: string;
  customerId: string;
  lng: number;
  lat: number;
  maxRadiusKm: number;
}): Promise<CandidateWorker[]> {
  const { serviceCategoryId, customerId, lng, lat, maxRadiusKm } = params;

  const rows = await prisma.$queryRaw<CandidateWorker[]>`
    SELECT
      wp.id AS "workerId",
      ST_Distance(
        wp."currentLocation"::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) / 1000.0 AS "distanceKm",
      wp."ratingAverage" AS "ratingAverage",
      COALESCE(prior.job_count, 0)::int AS "priorJobsWithCustomer",
      (
        (COALESCE(prior.job_count, 0) * 40.0) +
        (wp."ratingAverage" * 12.0) +
        (GREATEST(0, ${maxRadiusKm}::float - (ST_Distance(
          wp."currentLocation"::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) / 1000.0)) * 6.0)
      ) AS "continuityScore"
    FROM worker_profiles wp
    INNER JOIN worker_skills ws ON ws."workerProfileId" = wp.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS job_count
      FROM bookings b
      INNER JOIN customer_profiles cp ON cp.id = b."customerId"
      WHERE b."assignedWorkerId" = wp.id
        AND cp.id = ${customerId}
        AND b.status IN ('COMPLETED', 'SETTLED')
    ) prior ON true
    WHERE ws."skillCategoryId" = ${serviceCategoryId}
      AND ws."verificationStatus" = 'APPROVED'
      AND wp."verificationStatus" = 'APPROVED'
      AND wp."availabilityStatus" = 'AVAILABLE'
      AND wp."currentLocation" IS NOT NULL
      AND ST_DWithin(
        wp."currentLocation"::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${maxRadiusKm}::float * 1000
      )
    ORDER BY "continuityScore" DESC
    LIMIT 20
  `;

  return rows;
}
```

#### 4.4.2 Atomic Redis Locking

Every offer acquires a per-booking lock before it is allowed to write an acceptance, preventing two workers from accepting the same booking in a race:

```typescript
// src/lib/redis-lock.ts
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string);

const LOCK_TTL_MS = 5000;

/**
 * Attempts to acquire an exclusive lock on a booking for a specific worker.
 * Mirrors: SET lock:booking:<id> <worker_id> NX PX 5000
 */
export async function acquireBookingLock(bookingId: string, workerId: string): Promise<boolean> {
  const key = `lock:booking:${bookingId}`;
  const result = await redis.set(key, workerId, "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

export async function releaseBookingLock(bookingId: string, workerId: string): Promise<void> {
  // Lua script ensures a worker can only release a lock it holds (compare-and-delete)
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, `lock:booking:${bookingId}`, workerId);
}

export async function getBookingLockHolder(bookingId: string): Promise<string | null> {
  return redis.get(`lock:booking:${bookingId}`);
}
```

#### 4.4.3 Sequential Top-3 Timeout Queue and Pool Fallback

```typescript
// src/services/dispatch.service.ts
import { prisma } from "../lib/prisma";
import { redis, acquireBookingLock } from "../lib/redis-lock";
import { scoreCandidateWorkers } from "./continuity-scoring.service";
import { io } from "../lib/socket";
import { transitionBookingStatus } from "./booking-state-machine.service";

const TOP3_OFFER_TIMEOUT_SECONDS = 45;
const POOL_OFFER_TIMEOUT_SECONDS = 120;
const MAX_SEARCH_RADIUS_KM = 15;

export async function enqueueDispatch(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { customer: true }
  });

  const [lng, lat] = await getBookingCoordinates(bookingId);

  const candidates = await scoreCandidateWorkers({
    serviceCategoryId: booking.serviceCategoryId,
    customerId: booking.customerId,
    lng,
    lat,
    maxRadiusKm: MAX_SEARCH_RADIUS_KM
  });

  await transitionBookingStatus(bookingId, "DISPATCHING_TOP3");

  const top3 = candidates.slice(0, 3);
  const pool = candidates.slice(3);

  await runSequentialOfferQueue(bookingId, top3, "TOP3", TOP3_OFFER_TIMEOUT_SECONDS);

  const stillOpen = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (stillOpen && stillOpen.status === "DISPATCHING_TOP3") {
    await transitionBookingStatus(bookingId, "DISPATCHING_POOL");
    await runBroadcastOfferPool(bookingId, pool, POOL_OFFER_TIMEOUT_SECONDS);
  }
}

async function runSequentialOfferQueue(
  bookingId: string,
  candidates: { workerId: string; distanceKm: number; continuityScore: number }[],
  phaseLabel: "TOP3",
  timeoutSeconds: number
): Promise<void> {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const attemptNumber = (["ATTEMPT_1", "ATTEMPT_2", "ATTEMPT_3"] as const)[i];

    const dispatchLog = await prisma.dispatchLog.create({
      data: {
        bookingId,
        workerId: candidate.workerId,
        attemptNumber,
        distanceKm: candidate.distanceKm,
        continuityScore: candidate.continuityScore,
        outcome: "OFFERED"
      }
    });

    io.to(`worker:${candidate.workerId}`).emit("dispatch:offer", {
      dispatchLogId: dispatchLog.id,
      bookingId,
      phase: phaseLabel,
      offerExpiresInSeconds: timeoutSeconds
    });
    io.to(`booking:${bookingId}`).emit("dispatch:update", {
      bookingId,
      phase: phaseLabel,
      candidateStatus: { workerId: candidate.workerId, offerStatus: "WAITING" }
    });

    const outcome = await waitForResponseOrTimeout(dispatchLog.id, timeoutSeconds);

    if (outcome === "ACCEPTED") {
      return; // acceptBooking() already transitioned status inside the respond handler
    }
    // DECLINED or TIMEOUT: continue to the next candidate in the sequence
  }
}

async function runBroadcastOfferPool(
  bookingId: string,
  pool: { workerId: string; distanceKm: number; continuityScore: number }[],
  timeoutSeconds: number
): Promise<void> {
  const dispatchLogs = await prisma.$transaction(
    pool.map((candidate) =>
      prisma.dispatchLog.create({
        data: {
          bookingId,
          workerId: candidate.workerId,
          attemptNumber: "POOL",
          distanceKm: candidate.distanceKm,
          continuityScore: candidate.continuityScore,
          outcome: "OFFERED"
        }
      })
    )
  );

  for (const candidate of pool) {
    io.to(`worker:${candidate.workerId}`).emit("dispatch:offer", {
      bookingId,
      phase: "POOL",
      offerExpiresInSeconds: timeoutSeconds
    });
  }
  io.to(`booking:${bookingId}`).emit("dispatch:update", {
    bookingId,
    phase: "POOL",
    candidates: pool.map((c) => ({ workerId: c.workerId, offerStatus: "WAITING" }))
  });

  await new Promise<void>((resolve) => {
    const pollInterval = setInterval(async () => {
      const current = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!current || current.status !== "DISPATCHING_POOL") {
        clearInterval(pollInterval);
        resolve();
      }
    }, 2000);
    setTimeout(async () => {
      clearInterval(pollInterval);
      const current = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (current && current.status === "DISPATCHING_POOL") {
        await prisma.dispatchLog.updateMany({
          where: { id: { in: dispatchLogs.map((d) => d.id) }, outcome: "OFFERED" },
          data: { outcome: "TIMEOUT", respondedAt: new Date() }
        });
        await transitionBookingStatus(bookingId, "CANCELLED");
        io.to(`booking:${bookingId}`).emit("dispatch:exhausted", { bookingId });
      }
      resolve();
    }, timeoutSeconds * 1000);
  });
}

function waitForResponseOrTimeout(dispatchLogId: string, timeoutSeconds: number): Promise<"ACCEPTED" | "DECLINED" | "TIMEOUT"> {
  return new Promise((resolve) => {
    const channel = `dispatch-response:${dispatchLogId}`;
    const subscriber = redis.duplicate();
    let settled = false;

    const finish = async (outcome: "ACCEPTED" | "DECLINED" | "TIMEOUT") => {
      if (settled) return;
      settled = true;
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
      resolve(outcome);
    };

    subscriber.subscribe(channel, () => {
      subscriber.on("message", (_chan, message) => {
        finish(message as "ACCEPTED" | "DECLINED");
      });
    });

    setTimeout(async () => {
      await prisma.dispatchLog.updateMany({
        where: { id: dispatchLogId, outcome: "OFFERED" },
        data: { outcome: "TIMEOUT", respondedAt: new Date() }
      });
      finish("TIMEOUT");
    }, timeoutSeconds * 1000);
  });
}

async function getBookingCoordinates(bookingId: string): Promise<[number, number]> {
  const rows = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
    SELECT ST_X("customerLocation") AS lng, ST_Y("customerLocation") AS lat
    FROM bookings WHERE id = ${bookingId}
  `;
  return [rows[0].lng, rows[0].lat];
}
```

#### 4.4.4 Worker Response Handler (Accept / Decline)

```typescript
// src/controllers/dispatch.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { acquireBookingLock, redis } from "../lib/redis-lock";
import { transitionBookingStatus } from "../services/booking-state-machine.service";
import { io } from "../lib/socket";

const respondSchema = z.object({
  response: z.enum(["ACCEPT", "DECLINE"])
});

export async function respondToDispatch(req: AuthenticatedRequest, res: Response) {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_FAILED" });
  }

  const dispatchLog = await prisma.dispatchLog.findUnique({
    where: { id: req.params.dispatchLogId }
  });
  if (!dispatchLog || dispatchLog.workerId !== req.user!.id) {
    return res.status(404).json({ error: "DISPATCH_LOG_NOT_FOUND" });
  }
  if (dispatchLog.outcome !== "OFFERED") {
    return res.status(409).json({ error: "OFFER_NO_LONGER_ACTIVE" });
  }

  if (parsed.data.response === "DECLINE") {
    await prisma.dispatchLog.update({
      where: { id: dispatchLog.id },
      data: { outcome: "DECLINED", respondedAt: new Date() }
    });
    await redis.publish(`dispatch-response:${dispatchLog.id}`, "DECLINED");
    return res.json({ outcome: "DECLINED" });
  }

  // ACCEPT path: acquire the atomic Redis lock before writing anything
  const lockAcquired = await acquireBookingLock(dispatchLog.bookingId, dispatchLog.workerId);
  if (!lockAcquired) {
    await prisma.dispatchLog.update({
      where: { id: dispatchLog.id },
      data: { outcome: "LOCK_LOST", respondedAt: new Date() }
    });
    return res.status(409).json({ outcome: "LOCK_LOST" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: dispatchLog.bookingId } });
      if (booking.assignedWorkerId) {
        throw new Error("ALREADY_ASSIGNED");
      }
      await tx.dispatchLog.update({
        where: { id: dispatchLog.id },
        data: { outcome: "ACCEPTED", respondedAt: new Date() }
      });
      await tx.booking.update({
        where: { id: dispatchLog.bookingId },
        data: { status: "ASSIGNED", assignedWorkerId: dispatchLog.workerId, lockExpiresAt: null }
      });
      await tx.workerProfile.update({
        where: { id: dispatchLog.workerId },
        data: { availabilityStatus: "ON_JOB", currentBookingId: dispatchLog.bookingId }
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: "BOOKING_ACCEPTED",
          entityType: "Booking",
          entityId: dispatchLog.bookingId
        }
      });
    });

    await redis.publish(`dispatch-response:${dispatchLog.id}`, "ACCEPTED");
    io.to(`booking:${dispatchLog.bookingId}`).emit("dispatch:update", {
      bookingId: dispatchLog.bookingId,
      phase: "ASSIGNED",
      candidateStatus: { workerId: dispatchLog.workerId, offerStatus: "ACCEPTED" }
    });

    // Auto-confirm after 60s unless the customer cancels first
    setTimeout(async () => {
      await transitionBookingStatus(dispatchLog.bookingId, "CONFIRMED").catch(() => {});
    }, 60000);

    return res.json({ outcome: "ACCEPTED" });
  } catch (err) {
    return res.status(409).json({ outcome: "ALREADY_ASSIGNED" });
  }
}
```

#### 4.4.5 Booking State Machine Guard

Every status write in the system passes through this single function so the legal-transition table in Section 1.0 is enforced in exactly one place:

```typescript
// src/services/booking-state-machine.service.ts
import { prisma } from "../lib/prisma";
import { BookingStatus } from "@prisma/client";

const LEGAL_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["DISPATCHING_TOP3", "CANCELLED"],
  DISPATCHING_TOP3: ["ASSIGNED", "DISPATCHING_POOL", "CANCELLED"],
  DISPATCHING_POOL: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["SETTLED"],
  SETTLED: [],
  CANCELLED: []
};

export async function transitionBookingStatus(bookingId: string, next: BookingStatus): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!LEGAL_TRANSITIONS[booking.status].includes(next)) {
      throw new Error(`ILLEGAL_TRANSITION:${booking.status}->${next}`);
    }
    const timestampField: Partial<Record<BookingStatus, string>> = {
      CONFIRMED: "confirmedAt",
      IN_PROGRESS: "startedAt",
      COMPLETED: "completedAt",
      SETTLED: "settledAt",
      CANCELLED: "cancelledAt"
    };
    const field = timestampField[next];
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: next, ...(field ? { [field]: new Date() } : {}) }
    });
    await tx.auditLog.create({
      data: {
        action: "BOOKING_STATUS_CHANGED",
        entityType: "Booking",
        entityId: bookingId,
        metadata: { from: booking.status, to: next }
      }
    });
  });
}
```

### 4.5 Job Completion, Invoicing and Native Settlement (No Razorpay)

Completion is customer-review-triggered in this platform (there is no external gateway callback to wait on): the worker marks `COMPLETED`, which generates the `Invoice`; the customer's review submission is the event that finalizes `PaymentTransaction` and moves the booking to `SETTLED`, wrapped in one Prisma transaction so invoice, payment, review, and settlement are always consistent.

```typescript
// src/controllers/booking-completion.controller.ts
import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { transitionBookingStatus } from "../services/booking-state-machine.service";

export async function completeBooking(req: AuthenticatedRequest, res: Response) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
  if (booking.assignedWorkerId !== req.user!.id) {
    return res.status(403).json({ error: "NOT_ASSIGNED_WORKER" });
  }
  if (booking.status !== "IN_PROGRESS") {
    return res.status(409).json({ error: "INVALID_STATE" });
  }

  const config = await prisma.platformConfig.findUniqueOrThrow({ where: { id: 1 } });
  const platformFee = (Number(booking.estimatedTotal) * Number(config.commissionPercent)) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.invoice.create({
      data: {
        bookingId: booking.id,
        baseCharge: booking.baseCharge,
        hourlyCharge: booking.hourlyRate,
        platformFee,
        totalAmount: booking.estimatedTotal
      }
    });
    await tx.workerProfile.update({
      where: { id: booking.assignedWorkerId! },
      data: { availabilityStatus: "AVAILABLE", currentBookingId: null }
    });
  });

  return res.json({ bookingId: booking.id, status: "COMPLETED" });
}
```

```typescript
// src/controllers/review.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { issueFeedbackCredit } from "../services/feedback-credit.service";

const reviewSchema = z.object({
  punctuality: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  writtenFeedback: z.string().max(1000).optional()
});

export async function submitReview(req: AuthenticatedRequest, res: Response) {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_FAILED" });
  }
  const { punctuality, quality, professionalism, communication, writtenFeedback } = parsed.data;
  const overallScore = (punctuality + quality + professionalism + communication) / 4;

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { customer: true, invoice: true }
  });
  if (booking.customer.userId !== req.user!.id) {
    return res.status(403).json({ error: "NOT_BOOKING_OWNER" });
  }
  if (booking.status !== "COMPLETED" || !booking.invoice) {
    return res.status(409).json({ error: "INVALID_STATE" });
  }

  let creditIssued = 0;

  await prisma.$transaction(async (tx) => {
    await tx.review.create({
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        workerId: booking.assignedWorkerId!,
        punctuality,
        quality,
        professionalism,
        communication,
        overallScore,
        writtenFeedback
      }
    });

    const worker = await tx.workerProfile.findUniqueOrThrow({ where: { id: booking.assignedWorkerId! } });
    const newRatingCount = worker.ratingCount + 1;
    const newRatingAverage = (worker.ratingAverage * worker.ratingCount + overallScore) / newRatingCount;
    await tx.workerProfile.update({
      where: { id: worker.id },
      data: { ratingAverage: newRatingAverage, ratingCount: newRatingCount }
    });

    await tx.paymentTransaction.create({
      data: {
        invoiceId: booking.invoice!.id,
        paymentMethod: "CASH",
        paymentStatus: "PAID",
        amount: booking.invoice!.totalAmount,
        processedAt: new Date()
      }
    });

    await tx.creditTransaction.create({
      data: {
        workerProfileId: worker.id,
        type: "JOB_PAYOUT",
        amount: Number(booking.invoice!.totalAmount) - Number(booking.invoice!.platformFee),
        status: "COMPLETED",
        referenceBookingId: booking.id,
        settledAt: new Date()
      }
    });

    await tx.booking.update({ where: { id: booking.id }, data: { status: "SETTLED", settledAt: new Date() } });

    if (overallScore >= 4.5) {
      creditIssued = await issueFeedbackCredit(tx, worker.id, booking.id, Number(booking.invoice!.platformFee));
    }
  });

  return res.json({ reviewId: booking.id, overallScore, creditIssued });
}
```

### 4.6 WOW Factor 2 — Native Commission-Funded Feedback Credit System

Zero external payment dependency: every rupee of feedback credit is minted from the platform's own commission pool at the moment a high-quality review lands, then written to the worker's ledger as an ordinary `CreditTransaction`. There is no card network, no payment aggregator, and no Razorpay integration anywhere in this flow — redemption later settles through the same native wallet the earnings themselves live in (`BANK_TRANSFER_MOCK` or `CASH_PICKUP`).

```typescript
// src/services/feedback-credit.service.ts
import { Prisma } from "@prisma/client";

// The share of platform commission on a single booking that funds the
// feedback-credit pool when the customer leaves a >=4.5-star review
const FEEDBACK_CREDIT_COMMISSION_SHARE = 0.20; // 20% of the platform fee on that booking

export async function issueFeedbackCredit(
  tx: Prisma.TransactionClient,
  workerProfileId: string,
  bookingId: string,
  platformFeeOnBooking: number
): Promise<number> {
  const creditAmount = Math.round(platformFeeOnBooking * FEEDBACK_CREDIT_COMMISSION_SHARE * 100) / 100;
  if (creditAmount <= 0) return 0;

  await tx.feedbackCredit.upsert({
    where: { workerProfileId },
    create: {
      workerProfileId,
      commissionPoolTotal: creditAmount,
      distributedTotal: creditAmount
    },
    update: {
      commissionPoolTotal: { increment: creditAmount },
      distributedTotal: { increment: creditAmount }
    }
  });

  await tx.creditTransaction.create({
    data: {
      workerProfileId,
      type: "FEEDBACK_CREDIT",
      amount: creditAmount,
      status: "COMPLETED",
      referenceBookingId: bookingId,
      settledAt: new Date()
    }
  });

  return creditAmount;
}
```

### 4.7 Wallet Balance and Redemption (Concurrency-Safe, No Razorpay)

Redemption is guarded by a row-level `SELECT ... FOR UPDATE` on the worker's ledger inside a Prisma transaction, so two simultaneous redeem requests from the same worker (double-tap, duplicate request) cannot both succeed against the same balance:

```typescript
// src/controllers/wallet.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";

export async function getWallet(req: AuthenticatedRequest, res: Response) {
  const worker = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: req.user!.id } });
  const transactions = await prisma.creditTransaction.findMany({
    where: { workerProfileId: worker.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const availableBalance = transactions
    .filter((t) => t.status === "COMPLETED")
    .reduce((sum, t) => sum + (t.type === "REDEMPTION" ? -Number(t.amount) : Number(t.amount)), 0);
  const pendingBalance = transactions
    .filter((t) => t.status === "PROCESSING" && t.type === "REDEMPTION")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return res.json({
    availableBalance,
    pendingBalance,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      status: t.status,
      createdAt: t.createdAt
    }))
  });
}

const redeemSchema = z.object({
  amount: z.number().positive(),
  payoutMethod: z.enum(["BANK_TRANSFER_MOCK", "CASH_PICKUP"])
});

export async function redeemWallet(req: AuthenticatedRequest, res: Response) {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_FAILED" });
  }

  const worker = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: req.user!.id } });

  try {
    const transactionId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM worker_profiles WHERE id = ${worker.id} FOR UPDATE`;

      const completed = await tx.creditTransaction.findMany({
        where: { workerProfileId: worker.id, status: "COMPLETED" }
      });
      const balance = completed.reduce(
        (sum, t) => sum + (t.type === "REDEMPTION" ? -Number(t.amount) : Number(t.amount)),
        0
      );

      if (parsed.data.amount > balance) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const created = await tx.creditTransaction.create({
        data: {
          workerProfileId: worker.id,
          type: "REDEMPTION",
          amount: parsed.data.amount,
          status: "PROCESSING",
          payoutMethod: parsed.data.payoutMethod
        }
      });
      return created.id;
    });

    return res.json({ transactionId, status: "PROCESSING" });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_BALANCE") {
      return res.status(409).json({ error: "INSUFFICIENT_BALANCE" });
    }
    throw err;
  }
}
```

### 4.8 Standardized Error Envelope

`IMPLEMENTATION REQUIRED`. Every non-2xx response from every endpoint in this document — including the illustrative controllers above, which currently return ad hoc `{ "error": "SOME_CODE" }` shapes — uses this envelope. Claude Code updates every controller in Sections 4.3–4.7 to this shape as part of implementation; the shorter shapes shown above are Version 1.0 shorthand for "what error condition exists here," not the literal wire format.

```
{
  "error": {
    "code": "ERROR_CODE",       // stable, machine-readable, matches the codes already named throughout Section 4 (e.g. VALIDATION_FAILED, INSUFFICIENT_BALANCE, OFFER_NO_LONGER_ACTIVE)
    "message": "Safe message",  // human-readable, contains no stack trace, no SQL, no internal file paths, no secrets (Section 8.5)
    "requestId": "..."          // echoes the X-Request-Id set by request-id middleware (Section 8.3), correlates client report to server log
  }
}
```

HTTP status codes are standardized: `400` validation, `401` missing/invalid/expired/revoked token, `403` authenticated but not permitted (wrong role, or role-correct but not the resource owner — Section 7.3), `404` resource not found or not visible to this requester (IDOR-safe 404, Section 7.3), `409` legal conflict (state machine violation, duplicate, insufficient balance, lock lost), `422` semantically invalid but schema-valid input, `429` rate-limited (Section 8.2), `500` unexpected server error (message is always the generic `"An unexpected error occurred"` — the real error is logged server-side with the `requestId`, Section 22.4, never returned to the client).

### 4.9 Idempotency Requirements

`IMPLEMENTATION REQUIRED`. The following mutations accept an optional `Idempotency-Key` request header (a client-generated UUID). When present, the request handler checks the `IdempotencyKey` table (Section 3, keyed on `userId` + `route` + `key`) before executing: a first-seen key proceeds and stores the response; a repeated key with the same request-body hash returns the stored response verbatim without re-executing the mutation; a repeated key with a different request-body hash returns `409 IDEMPOTENCY_KEY_REUSE`. Absence of the header does not block the request — it proceeds normally without replay protection, so idempotency is opt-in for clients that need retry safety, but the server-side table and check logic must exist and be wired to these six routes:

| Endpoint | Why idempotency matters here |
|---|---|
| `POST /api/v1/bookings/request` | A network-retried request must not create two bookings for one customer action |
| `POST /api/v1/dispatch/:dispatchLogId/respond` (ACCEPT) | Already defended by the Redis lock + `assignedWorkerId` check (Section 4.4.4); the idempotency key is a second, client-retry-safe layer that returns the original ACCEPTED result instead of a possibly-confusing LOCK_LOST on a harmless resend |
| Payment/invoice recording (`POST /api/v1/bookings/:id/complete`, which creates the `Invoice`) | A retried completion call must not create two invoices for one booking (also defended by the `status !== 'IN_PROGRESS'` guard, which makes the second call a safe 409 rather than a duplicate — the idempotency key upgrades that 409 into a clean replay of the original success response) |
| `POST /api/v1/workers/me/wallet/redeem` | A double-tap or retried redemption must not create two `REDEMPTION` transactions for one user action |
| `POST /api/v1/bookings/:id/review` | A retried review submission must not double-count the Feedback Credit or double-update the worker's rating average |
| Admin financial adjustments (`POST /api/v1/admin/wallet/adjustments`, Section 15) | A retried admin credit/debit must not apply twice |

### 4.10 Rate Limiting

`IMPLEMENTATION REQUIRED`. Token-bucket rate limiting via `rate-limiter-flexible` backed by Redis, keyed by `userId` when authenticated and by IP address when not. Limits are per-route-class, not global:

| Route class | Limit | Rationale |
|---|---|---|
| `POST /api/v1/auth/*/login` | 10 attempts / 15 min per IP+identifier pair | Brute-force protection (Section 6.6) |
| `POST /api/v1/auth/*/register` | 5 / hour per IP | Signup abuse / fake-account farming |
| `POST /api/v1/bookings/request` | 20 / hour per customer | Booking-spam / dispatch-flooding abuse |
| `POST /api/v1/dispatch/:dispatchLogId/respond` | 60 / hour per worker | Generous — workers legitimately respond often; still bounds abuse scripts |
| `POST /api/v1/bookings/:id/review` | 1 per booking (enforced by the `bookingId @unique` constraint on Review, not just rate limiting) plus 30/day per customer as an abuse ceiling | Fake-review flooding |
| `POST /api/v1/workers/me/wallet/redeem` | 5 / day per worker | Wallet-abuse containment |
| `POST /api/v1/workers/location-ping` | 1 / 5s per worker (in addition to the existing 10s Redis debounce on the write itself) | GPS-spam / socket-flood containment |
| All other authenticated routes | 300 / 5 min per user | Generic API-abuse ceiling |
| All public/unauthenticated routes | 100 / 5 min per IP | Generic abuse ceiling for `/public/stats`, `/services` |

A limit breach returns `429` with the standardized envelope (`code: "RATE_LIMITED"`) and a `Retry-After` header.

### 4.11 Extended Route Hardening Matrix

`IMPLEMENTATION REQUIRED`. This table adds the security/operational metadata the base route matrix (Section 4.2) did not carry: which routes require an audit-log row, which emit a Socket.io event, and which carry the ownership check that prevents IDOR (Section 7.3 defines the general pattern; this table names the specific check per route).

| Route | Idempotency-Key supported | Audit event | Socket event emitted | IDOR ownership check |
|---|---|---|---|---|
| `POST /bookings/request` | Yes | `BOOKING_CREATED` | — | `customerProfile.userId === req.user.id` (implicit — profile is looked up by req.user.id) |
| `GET /bookings/:id` | — | — | — | requester is the booking's customer (`booking.customer.userId === req.user.id`), the assigned worker (`booking.assignedWorker.userId === req.user.id`), or role `ADMIN` — anything else is `404` (not `403`, to avoid confirming the booking id exists to an unrelated user) |
| `POST /bookings/:id/review` | Yes | `REVIEW_SUBMITTED` | — | `booking.customer.userId === req.user.id` (already shown in Section 4.5) |
| `POST /dispatch/:dispatchLogId/respond` | Yes | `BOOKING_ACCEPTED` / `DISPATCH_DECLINED` | `dispatch:update` | `dispatchLog.workerId === req.user's WorkerProfile.id` (already shown in Section 4.4.4) |
| `PATCH /bookings/:id/start`, `/complete` | complete: Yes | `BOOKING_STARTED` / `BOOKING_COMPLETED` | `dispatch:update` (phase change) | `booking.assignedWorkerId === req.user's WorkerProfile.id` (already shown in Section 1.1.6) |
| `POST /workers/me/wallet/redeem` | Yes | `WALLET_REDEMPTION_REQUESTED` | — | implicit — worker profile resolved from `req.user.id`, never from a body/path parameter |
| `PATCH /admin/workers/:id/verify` | — | `WORKER_VERIFIED` / `WORKER_REJECTED` (`metadata.reason` required on reject) | `notification:new` to the worker | role `ADMIN` only; no ownership check needed (admin acts on any worker) |
| `POST /admin/bookings/:id/force-assign` | Yes | `ADMIN_FORCE_ASSIGN` (`metadata.reason` required) | `dispatch:update` | role `ADMIN` only |
| `PATCH /admin/customers/:id/status` | — | `CUSTOMER_STATUS_CHANGED` (`metadata.reason` required) | — | role `ADMIN` only |
| `POST /admin/notifications/broadcast` | — | `NOTIFICATION_BROADCAST` | `notification:new` fan-out | role `ADMIN` only |
| `PATCH /admin/config` | — | `PLATFORM_CONFIG_CHANGED` | — | role `ADMIN`, `isSuper = true` only (Section 15.6) |

Every route tagged with a required `metadata.reason` in the Audit event column rejects the request with `400 REASON_REQUIRED` if the field is absent — this is the standardization of the "reason where appropriate" requirement across all sensitive admin actions, not just `force-assign` as Version 1.0 specified it.

### 4.12 Corrections to Version 1.0 (Contradictions Found and Fixed)

`IMPLEMENTATION REQUIRED`. Two logic defects were found in the Version 1.0 reference code during this audit. Both are specification corrections — the illustrative code in Sections 4.3–4.7 is left as-is (Section 0.3: this pass adds no new source code), and Claude Code applies these corrections when it writes the real implementation.

1. **`transitionBookingStatus` cannot be called from inside `submitReview`'s transaction as shown.** Section 4.4.5 defines `transitionBookingStatus(bookingId, next)` as a function that opens its own `prisma.$transaction`. Section 4.5's `submitReview` controller needs to move the booking to `SETTLED` but does so with a raw `tx.booking.update(...)` inline instead of calling the shared guard — because calling a function that opens `prisma.$transaction(...)` from inside an already-open `tx` callback is not the same connection/transaction and would not be atomic with the rest of that block. **Correction:** `transitionBookingStatus` must be refactored to accept an optional injectable Prisma client: `transitionBookingStatus(bookingId: string, next: BookingStatus, client: PrismaClient | Prisma.TransactionClient = prisma)`, using `client` everywhere internally instead of always using the top-level `prisma` singleton. Every call site that already sits inside a transaction (like `submitReview`) passes its `tx` in; every call site that does not (like the dispatch engine's phase transitions) omits the parameter and gets the default top-level-transaction behavior. This makes the legal-transition check in Section 4.4.5 actually enforce itself on the `COMPLETED -> SETTLED` transition, which today bypasses it entirely.
2. **The continuity-scoring query ignores each worker's individually configured `serviceAreaRadiusKm`.** `WorkerProfile.serviceAreaRadiusKm` exists in the schema specifically so a worker can configure how far they're willing to travel, but Section 4.4.1's `scoreCandidateWorkers` filters every candidate against one global constant, `MAX_SEARCH_RADIUS_KM = 15`, ignoring the per-worker column entirely — a worker who configured a 5km radius could be offered a 14km job, and a worker willing to travel 25km is artificially capped at 15km. **Correction:** the `ST_DWithin` predicate's radius argument must be `LEAST(wp."serviceAreaRadiusKm", :maxRadiusKm) * 1000` (keeping the global constant only as an absolute platform-wide ceiling, e.g. so no worker's self-declared radius can force an unreasonably expensive scan), and the same `LEAST(...)` expression replaces the flat `${maxRadiusKm}` in the `continuityScore` proximity term so the scoring bonus is computed against each worker's own effective radius, not the global one.

---

## Section 5: Postman Automated Test Suite and Claude Code Desktop Execution Instructions

### 5.1 Postman v2.1 Collection — `api_test_collection.postman_json`

Save the JSON below as `postman/api_test_collection.postman_json` (it is a valid Postman v2.1 collection; import it directly into Postman or run it headlessly with `newman run postman/api_test_collection.postman_json -e postman/worksetu.postman_environment.json`). It chains the full happy path end to end — customer registers, requests a booking, worker registers/logs in, worker accepts the dispatch offer, worker starts and completes the job, customer submits a 5-star review (which triggers the Feedback Credit mint), and the worker redeems the wallet — plus the admin verification and force-assign paths.

```json
{
  "info": {
    "name": "Worksetu API Test Suite",
    "description": "End-to-end contract tests for the Worksetu cooperative gig-service backend — customer, provider, and admin flows, native wallet only, no Razorpay",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    "_postman_id": "b7e1a2f0-4c3d-4a2e-9b1a-worksetu-api-suite"
  },
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:4000/api/v1" },
    { "key": "customerToken", "value": "" },
    { "key": "workerToken", "value": "" },
    { "key": "adminToken", "value": "" },
    { "key": "bookingId", "value": "" },
    { "key": "dispatchLogId", "value": "" },
    { "key": "workerProfileId", "value": "" }
  ],
  "item": [
    {
      "name": "01 - Customer Register",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/auth/customer/register",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"fullName\": \"Deepika Ramaswamy\",\n  \"email\": \"deepika.qa@example.com\",\n  \"phone\": \"9876500001\",\n  \"password\": \"TestPass@123\",\n  \"address\": \"54, Gandhi Nagar Main Road, Adyar, Chennai\",\n  \"lat\": 13.0064,\n  \"lng\": 80.2569\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 201', () => pm.response.to.have.status(201));",
              "const body = pm.response.json();",
              "pm.test('token present', () => pm.expect(body.token).to.be.a('string'));",
              "pm.collectionVariables.set('customerToken', body.token);"
            ]
          }
        }
      ]
    },
    {
      "name": "02 - Worker Register",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/auth/worker/register",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"fullName\": \"Ravi Kumar\",\n  \"email\": \"ravi.qa@example.com\",\n  \"phone\": \"9876500002\",\n  \"password\": \"TestPass@123\",\n  \"cooperativeId\": \"coop-1\",\n  \"primarySkillId\": \"plumbing\",\n  \"experienceYears\": 6,\n  \"homeLocation\": { \"lat\": 13.0012, \"lng\": 80.2565, \"address\": \"Adyar, Chennai\" },\n  \"serviceAreaRadiusKm\": 10\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 201', () => pm.response.to.have.status(201));",
              "const body = pm.response.json();",
              "pm.test('worker profile id present', () => pm.expect(body.workerProfileId).to.be.a('string'));",
              "pm.collectionVariables.set('workerProfileId', body.workerProfileId);"
            ]
          }
        }
      ]
    },
    {
      "name": "03 - Worker Login",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/auth/worker/login",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"identifier\": \"ravi.qa@example.com\",\n  \"password\": \"TestPass@123\"\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "const body = pm.response.json();",
              "pm.collectionVariables.set('workerToken', body.token);"
            ]
          }
        }
      ]
    },
    {
      "name": "04 - Admin Login",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/auth/admin/login",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"identifier\": \"registrar@worksetu.coop\",\n  \"password\": \"AdminPass@123\"\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "pm.collectionVariables.set('adminToken', pm.response.json().token);"
            ]
          }
        }
      ]
    },
    {
      "name": "05 - Admin Verifies Worker",
      "request": {
        "method": "PATCH",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{adminToken}}" }
        ],
        "url": "{{baseUrl}}/admin/workers/{{workerProfileId}}/verify",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"decision\": \"APPROVED\"\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "pm.test('verificationStatus is APPROVED', () => pm.expect(pm.response.json().verificationStatus).to.eql('APPROVED'));"
            ]
          }
        }
      ]
    },
    {
      "name": "06 - Worker Sets Availability AVAILABLE",
      "request": {
        "method": "PATCH",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{workerToken}}" }
        ],
        "url": "{{baseUrl}}/workers/me/availability",
        "body": { "mode": "raw", "raw": "{\n  \"status\": \"AVAILABLE\"\n}" }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": ["pm.test('status is 200', () => pm.response.to.have.status(200));"]
          }
        }
      ]
    },
    {
      "name": "07 - Customer Creates Booking Request",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{customerToken}}" }
        ],
        "url": "{{baseUrl}}/bookings/request",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"serviceCategoryId\": \"plumbing\",\n  \"location\": { \"address\": \"54, Gandhi Nagar Main Road, Adyar, Chennai\", \"lat\": 13.0064, \"lng\": 80.2569 },\n  \"description\": \"Leaking kitchen tap and pipe needs replacement\",\n  \"scheduledAt\": null,\n  \"urgency\": \"URGENT\"\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 201', () => pm.response.to.have.status(201));",
              "const body = pm.response.json();",
              "pm.test('status is REQUESTED', () => pm.expect(body.status).to.eql('REQUESTED'));",
              "pm.collectionVariables.set('bookingId', body.bookingId);"
            ]
          }
        }
      ]
    },
    {
      "name": "08 - Worker Fetches Incoming Offers",
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{workerToken}}" }],
        "url": "{{baseUrl}}/workers/me/incoming"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "const body = pm.response.json();",
              "if (body.length > 0) { pm.collectionVariables.set('dispatchLogId', body[0].dispatchLogId); }"
            ]
          }
        }
      ]
    },
    {
      "name": "09 - Worker Accepts Dispatch Offer",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{workerToken}}" }
        ],
        "url": "{{baseUrl}}/dispatch/{{dispatchLogId}}/respond",
        "body": { "mode": "raw", "raw": "{\n  \"response\": \"ACCEPT\"\n}" }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "pm.test('outcome is ACCEPTED', () => pm.expect(pm.response.json().outcome).to.eql('ACCEPTED'));"
            ]
          }
        }
      ]
    },
    {
      "name": "10 - Worker Starts Service",
      "request": {
        "method": "PATCH",
        "header": [{ "key": "Authorization", "value": "Bearer {{workerToken}}" }],
        "url": "{{baseUrl}}/bookings/{{bookingId}}/start"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": ["pm.test('status is 200', () => pm.response.to.have.status(200));"]
          }
        }
      ]
    },
    {
      "name": "11 - Worker Completes Service",
      "request": {
        "method": "PATCH",
        "header": [{ "key": "Authorization", "value": "Bearer {{workerToken}}" }],
        "url": "{{baseUrl}}/bookings/{{bookingId}}/complete"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "pm.test('status is COMPLETED', () => pm.expect(pm.response.json().status).to.eql('COMPLETED'));"
            ]
          }
        }
      ]
    },
    {
      "name": "12 - Customer Submits 5-Star Review (Triggers Feedback Credit)",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{customerToken}}" }
        ],
        "url": "{{baseUrl}}/bookings/{{bookingId}}/review",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"punctuality\": 5,\n  \"quality\": 5,\n  \"professionalism\": 5,\n  \"communication\": 5,\n  \"writtenFeedback\": \"Quick and professional, solved the leak in ten minutes\"\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "const body = pm.response.json();",
              "pm.test('overallScore is 5', () => pm.expect(body.overallScore).to.eql(5));",
              "pm.test('creditIssued is greater than 0', () => pm.expect(body.creditIssued).to.be.above(0));"
            ]
          }
        }
      ]
    },
    {
      "name": "13 - Worker Checks Wallet Balance",
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{workerToken}}" }],
        "url": "{{baseUrl}}/workers/me/wallet"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200', () => pm.response.to.have.status(200));",
              "pm.test('availableBalance is a number', () => pm.expect(pm.response.json().availableBalance).to.be.a('number'));"
            ]
          }
        }
      ]
    },
    {
      "name": "14 - Worker Redeems Wallet (Native, No Razorpay)",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{workerToken}}" }
        ],
        "url": "{{baseUrl}}/workers/me/wallet/redeem",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"amount\": 50,\n  \"payoutMethod\": \"BANK_TRANSFER_MOCK\"\n}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('status is 200 or 409', () => pm.expect([200, 409]).to.include(pm.response.code));"
            ]
          }
        }
      ]
    },
    {
      "name": "15 - Admin Views Booking Ledger",
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{adminToken}}" }],
        "url": "{{baseUrl}}/admin/bookings/ledger?status=SETTLED&page=1"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": ["pm.test('status is 200', () => pm.response.to.have.status(200));"]
          }
        }
      ]
    }
  ]
}
```

### 5.2 Step-by-Step Claude Code Desktop Execution Instructions

These steps are written to be pasted, in order, into the Claude Code Desktop Application prompt window against a fresh clone of the repository that already contains this `system-blueprint.md` at the project root alongside the existing `index.html`, `app.js`, `mockData.js`, and `translations.js`.

1. `Read system-blueprint.md in full, then scaffold a Node.js + TypeScript Express backend under /server with the folder structure src/controllers, src/services, src/middleware, src/lib, prisma, postman — do not start writing route logic yet, just the skeleton, package.json with express, @prisma/client, prisma, ioredis, socket.io, zod, jsonwebtoken, bcrypt, and a tsconfig.json targeting ES2022`
2. `Copy the schema.prisma from Section 3 of system-blueprint.md verbatim into /server/prisma/schema.prisma, then run npx prisma format and npx prisma validate and fix any errors it reports before moving on`
3. `Set up a Supabase project (or point DATABASE_URL and DIRECT_URL at an existing one), enable the postgis extension, then run npx prisma migrate dev --name init followed by the spatial index migration SQL from Section 3.1 of system-blueprint.md`
4. `Copy every TypeScript code block from Section 4 of system-blueprint.md into the matching file path shown in each block's header comment (for example the code block starting with // src/middleware/auth.ts goes into /server/src/middleware/auth.ts), applying the two corrections in Section 4.12 while transcribing (do not transcribe the pre-correction versions), standardizing every response to the Section 4.8 error envelope, and wiring Idempotency-Key handling per Section 4.9 into the six routes listed there — then wire everything together in /server/src/app.ts and /server/src/routes/index.ts using the full route matrix table in Section 4.2 plus the hardening columns in Section 4.11 as the source of truth for every path, method, guard, audit event, and socket event`
5. `Replace translations.js with the complete window.translations object from Section 2.2 of system-blueprint.md, then grep index.html for every hardcoded English string listed in the implementation note at the end of Section 2 and replace each with the matching t('key') call`
6. `Create a .env file for /server with DATABASE_URL, DIRECT_URL, JWT_SECRET, REDIS_URL, PORT — do not commit it — and confirm the server boots with npm run dev and responds 200 on GET /api/v1/public/stats`
7. `Start a local Redis instance (or point REDIS_URL at a hosted one), then manually exercise the dispatch flow once end to end using two terminal sessions: create a booking as a customer, watch the Socket.io booking:{id} room in the second session, and confirm a worker acceptance moves the booking through DISPATCHING_TOP3 to ASSIGNED within the 45-second window described in Section 4.4`
8. `Import postman/api_test_collection.postman_json from Section 5.1 into Postman, or run it headlessly with npx newman run postman/api_test_collection.postman_json, and fix any failing assertion before considering the backend done — do not modify the test expectations to make them pass`
9. `Run a final full-repository search for the string razorpay (case-insensitive) across /server and the frontend files and confirm zero matches, then run a search for a period immediately before a closing quote in translations.js across all four locale blocks and confirm zero matches`
10. `Open index.html in a browser against the running backend, switch the language selector through English, Hindi, Tamil, and Bengali, and visually confirm no UI label displays as a missing-translation fallback key`

### 5.3 Security, Load, and Failure-Recovery Test Additions

`IMPLEMENTATION REQUIRED`. The Section 5.1 collection covers the happy path only. Before the backend is considered done, Claude Code additionally runs (and, for the automatable ones, adds as further Postman/newman requests or a separate script):

- **Security:** every request in Section 5.1 repeated with (a) no `Authorization` header — expect `401`; (b) a customer token calling a worker-only or admin-only route — expect `403`; (c) a valid customer token requesting a `bookingId` belonging to a different customer via `GET /bookings/:id` — expect `404`, not `403` or `200` (Section 7.3); (d) a malformed/expired JWT — expect `401` with `code: "INVALID_TOKEN"` or `"TOKEN_EXPIRED"`. See Section 20.4 for the full security test matrix.
- **Load:** a k6 or Artillery script drives concurrent booking creation and dispatch acceptance to validate the p95 targets in Section 24.1, run against staging only, never production.
- **Failure/recovery (Section 20.5):** two workers accepting the same dispatch offer concurrently (expect exactly one `ACCEPTED`, one `LOCK_LOST`); two simultaneous redemption requests from the same worker for an amount that only one can afford (expect exactly one `PROCESSING`, one `409 INSUFFICIENT_BALANCE`); killing the server process mid-dispatch and confirming the Section 11.4 reconciliation sweep resumes or safely cancels the orphaned booking on restart; disconnecting Redis mid-request and confirming the API degrades per Section 3.3 rule 1 instead of crashing; disconnecting a Socket.io client mid-dispatch and confirming the reconnect/missed-event behavior in Section 12.5 delivers the current state rather than a stale one.

---

## Section 6: Authentication and Session Management

`IMPLEMENTATION REQUIRED` throughout this section unless otherwise tagged. This section fully specifies the auth system that Section 4.1's `requireAuth` middleware only partially covered (it validated a token; it did not define how tokens are issued, refreshed, revoked, or how a password is reset).

### 6.1 Token Strategy

- **Access token:** JWT, HS256, 15-minute expiry, payload `{ sub: userId, role, tokenVersion, iat, exp }`. Never stores email, phone, or any PII beyond the user id and role.
- **Refresh token:** opaque random 256-bit value (not a JWT), returned to the client once at login/register/refresh time, stored server-side only as its SHA-256 hash in the `RefreshToken` table (Section 3), 30-day expiry. The raw value is never logged or persisted anywhere in plaintext.
- **Storage on the client:** the frontend holds the access token in memory (a JS variable in the Vue app state, not `localStorage`) and the refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/v1/auth/refresh` — this is the CSRF mitigation (Section 9.6): the access token travels only as an `Authorization: Bearer` header, which a cross-site form or image tag cannot forge, and the refresh cookie is `SameSite=Strict` so it is not sent on cross-site requests at all.

### 6.2 Login / Register

`POST /api/v1/auth/{customer,worker,admin}/register` and `.../login` (already specified in Section 1.1.2, 1.2.1, and the route matrix) additionally, on success: create a `RefreshToken` row, set the refresh cookie, and return only the access token in the JSON body (the `refreshToken` field shown in Section 1.1.2's response shape moves from the JSON body to the cookie — this is the one wire-format change to an existing contract in this pass, made because returning a long-lived credential in a JSON body that a frontend might accidentally log or store in `localStorage` is the exact CSRF/XSS exposure this section closes). Passwords are hashed with `bcrypt`, cost factor 12, before the `INSERT`; the plaintext password is never logged (Section 8.6, Section 17.6) and never appears in any `AuditLog.metadata`.

### 6.3 Refresh Rotation and Revocation

`POST /api/v1/auth/refresh` (public route, authenticates via the httpOnly cookie, not a bearer token): looks up the refresh token by its hash, rejects with `401` if not found, revoked, or expired; on success, revokes the presented token (`revokedAt = now()`), issues a new refresh token, links it via `replacedByTokenId`, sets the new cookie, and returns a new 15-minute access token. **Reuse detection:** if a refresh token that is already `revokedAt IS NOT NULL` is presented again (a stolen/replayed token used after the legitimate client already rotated past it), the entire refresh-token family for that user is revoked and `User.tokenVersion` is incremented, invalidating every outstanding access token immediately regardless of its `exp` — this is the replay-attack mitigation (Section 9.10).

### 6.4 Logout and Session Invalidation

`POST /api/v1/auth/logout` (JWT Customer/Provider/Admin): revokes the specific `RefreshToken` presented in the cookie (`revokedAt = now()`) and clears the cookie. `POST /api/v1/auth/logout-all`: increments `User.tokenVersion` (invalidating every issued access token immediately, since Section 4.1's verify step must be extended to check `payload.tokenVersion === user.tokenVersion` in the database — an addition to the `requireAuth` middleware) and revokes every non-revoked `RefreshToken` for that user. Suspending a user (`AccountStatus.SUSPENDED`, Section 1.3.6) has the same effect as `logout-all`, applied by the admin action, not by the user.

### 6.5 Password Reset and Account Verification

- **Password reset:** `POST /api/v1/auth/password-reset/request` (public, req `{ identifier: string }`) always returns `200` regardless of whether the identifier matches an account (prevents user enumeration, Section 9 threat table) and, if it does match, creates a `PasswordResetToken` (15-minute expiry, single use) and dispatches it through the Section 18 notification abstraction. `POST /api/v1/auth/password-reset/confirm` (public, req `{ token, newPassword }`) validates the token hash, expiry, and `usedAt IS NULL`, updates `passwordHash`, sets `usedAt = now()`, and increments `tokenVersion` (forces re-login everywhere, including any session an attacker may have had).
- **Account verification:** registration creates an `OtpVerification` row (channel `EMAIL` or `PHONE`, 6-digit code, bcrypt-hashed, 10-minute expiry) and dispatches it through Section 18. `POST /api/v1/auth/verify-otp` (JWT-authenticated, req `{ channel, code }`) checks the hash, increments `attempts` on mismatch (locks after 5 failed attempts, requiring a fresh OTP request), and sets `emailVerifiedAt`/`phoneVerifiedAt` on success. Unverified accounts may log in and browse but `POST /api/v1/bookings/request` and `POST /api/v1/auth/worker/register`'s downstream verification-submission actions require `phoneVerifiedAt IS NOT NULL` — this gate is new in this pass and did not exist in Version 1.0, which allowed unverified accounts to transact.

### 6.6 Brute-Force Protection

In addition to the login-route rate limit (Section 4.10), `User.failedLoginAttempts` increments on every failed password check and resets to `0` on success; at `5` failed attempts, `User.lockedUntil` is set to `now() + 15 minutes` and further login attempts return `423 ACCOUNT_LOCKED` (with the standard envelope) until that time passes, regardless of remaining rate-limit budget. This is a per-account lock layered under the per-IP rate limit so a distributed brute-force attempt (many IPs, one target account) is still stopped.

---

## Section 7: RBAC and Authorization

`IMPLEMENTATION REQUIRED`.

### 7.1 Roles

Exactly three roles exist, matching `UserRole` in Section 3: `CUSTOMER`, `WORKER`, `ADMIN`. There is no role hierarchy — `ADMIN` is not "a superset of WORKER and CUSTOMER," it is a distinct role with its own route set (Section 4.2's `admin/*` paths). `AdminProfile.isSuper` is a sub-flag within `ADMIN` for the single most sensitive action in the system (`PATCH /admin/config`, Section 15.6) — it is not a fourth role.

### 7.2 Deny-by-Default

Every route not explicitly listed in Section 4.2 with a `Public` auth guard requires authentication. The Express router is configured so that adding a new route without an explicit `requireAuth(...)` call is a lint-time failure, not a runtime gap: every router file exports routes through a wrapper that requires an explicit guard argument (`Public`, `requireCustomer`, `requireProvider`, or `requireAdmin`) — there is no code path that mounts a route without one of these four being stated.

### 7.3 IDOR / BOLA Prevention Pattern

This is the single pattern every resource-scoped endpoint in this system follows, generalizing what Sections 1.1.6, 4.4.4, and 4.5 already show for specific routes:

1. Resolve the authenticated identity from `req.user.id` (set by the JWT middleware) — never from a request body or path parameter that names a user, worker, or customer id.
2. Load the target resource by its path-parameter id.
3. Compare an ownership field on the loaded resource (`booking.customer.userId`, `booking.assignedWorker.userId`, `dispatchLog.workerId` resolved to a user, `creditTransaction.workerProfile.userId`, etc.) against the identity from step 1.
4. If they do not match and the role is not `ADMIN`, respond `404`, not `403`. A `403` confirms the resource exists but is someone else's; a `404` reveals nothing. The one exception is role-gated routes with no per-resource ownership concept (`admin/*` routes gated purely by role) — those correctly return `403` for a wrong-role request, since there is no resource-existence fact to protect.

Applying this pattern retroactively: every endpoint in Section 4.2 that takes a `:id` path parameter and is not already shown with an ownership check in Sections 1 or 4 must have one added per this pattern before it is implemented. Section 4.11 names the specific check for the highest-risk routes; the same pattern extends to every other `:id`-scoped route not explicitly listed there (e.g. `GET /workers/me/bookings/:id` if such a per-item detail route is added during implementation).

### 7.4 Privilege Escalation Prevention

- **Vertical (role escalation):** a request body must never be able to set or change `User.role` or `AdminProfile.isSuper`. No endpoint in Section 4.2 accepts a `role` field in its request body; `POST /admin/*` user-management endpoints operate on `verificationStatus`, `accountStatus`, or `AdminProfile` fields explicitly, never on `role` itself. Role assignment happens exactly once, at registration, based on which of the three `register` endpoints was called — there is no "promote to admin" API in this system; admin accounts are provisioned by direct database seed/migration (Section 21.5), never through a public or customer/worker-authenticated endpoint.
- **Horizontal (same-role, different-identity):** covered by Section 7.3 — a `WORKER` acting on another worker's dispatch offer, wallet, or bookings is the horizontal case, and the ownership check is the mitigation.
- **JWT tampering:** the `requireAuth` middleware (Section 4.1) verifies the JWT signature server-side on every request using `JWT_SECRET`; a client cannot forge a role or user id by editing the token payload without invalidating the signature. `JWT_SECRET` is a high-entropy value stored only in the environment (Section 21.6), never in source control, never logged.

---

## Section 8: API Security Framework

`IMPLEMENTATION REQUIRED`.

### 8.1 Request Validation

Every request body, query string, and path parameter is validated with a Zod schema before any handler logic runs, following the exact pattern already shown in Section 4.3 (`requestBookingSchema`) and Section 4.4.4/4.5/4.7 — this is now a blanket requirement for every route in Section 4.2, not just the ones with example code. A failed validation returns `400` with `code: "VALIDATION_FAILED"` and the envelope's `message` summarizing the first failing field only (Zod's full `error.flatten()` output, which can include internal field paths, is logged server-side with the `requestId` but not returned in the response body — this narrows Section 4.3's example, which returned `details: parsed.error.flatten()` directly to the client; that detailed shape is downgraded to server-side-only logging as part of this hardening pass to avoid leaking schema internals).

### 8.2 CORS

An explicit origin allowlist (`CORS_ALLOWED_ORIGINS` env var, comma-separated), not `*` and not a reflected-origin wildcard. Staging and production each configure their own allowlist containing only their known frontend origin(s). Credentials (`Access-Control-Allow-Credentials: true`) are enabled only because the refresh-token cookie (Section 6.1) requires it — this makes the explicit allowlist mandatory, since credentialed CORS with a wildcard origin is rejected by browsers and would be a critical misconfiguration if attempted.

### 8.3 Security Headers and Request IDs

`helmet` (or equivalent) middleware sets: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` (restrictive default-src, since the API serves JSON, not HTML), and removes `X-Powered-By`. A request-id middleware runs first in the chain: reads `X-Request-Id` from the incoming request if present (useful for client-generated correlation) or generates a UUID if absent, attaches it to `req.id`, echoes it back as a response header, and includes it in every structured log line (Section 22.4) and every error envelope (Section 4.8).

### 8.4 Body Size and Pagination Limits

JSON body size is capped at `1mb` for all routes except the document-upload routes (Section 16), which use `multipart/form-data` with the per-file and per-request caps defined there. Pagination limits are defined in Section 3.3 rule 5 and apply uniformly.

### 8.5 Safe Error Responses

No response body, at any status code, ever contains: a stack trace, a raw database error message (Prisma error objects are caught and mapped to a generic `500` with a stable `code`, never re-serialized to the client), a file path, an environment variable name or value, or a raw third-party error body. A global Express error-handling middleware is the single place this mapping happens, so no individual controller can accidentally leak an unmapped error.

### 8.6 Safe Logging

Structured JSON logs (Section 22.4 defines the full shape) never include: `passwordHash` or plaintext passwords, JWT/refresh-token/OTP/reset-token raw values (only their presence/absence and, where useful for debugging, a truncated hash prefix), full request bodies for auth or wallet routes (log route + status + latency + requestId + a safe user identifier only — not the body), uploaded document contents or their signed URLs (Section 16.6), or precise GPS coordinates beyond what Section 12.4's privacy rule already permits recording.

---

## Section 9: Threat Model and Mitigations

`IMPLEMENTATION REQUIRED`. Every threat named in the audit brief is enumerated here with its concrete mitigation and the test that proves the mitigation holds (cross-referenced into Section 20.4's security test matrix, which is the executable form of this table).

| # | Threat | Attack vector in this system | Mitigation | Verified by |
|---|---|---|---|---|
| 1 | IDOR / BOLA | Requesting another user's booking/wallet/profile by guessing or enumerating an id | Section 7.3 ownership-check pattern on every `:id` route | Section 20.4 test: cross-account resource access returns 404 |
| 2 | Vertical privilege escalation | Crafting a request to gain `ADMIN` capability from a `CUSTOMER`/`WORKER` token | Section 7.4: no endpoint accepts a `role` field; role guards are deny-by-default (7.2) | Section 20.4 test: wrong-role token against every admin route returns 403 |
| 3 | Horizontal privilege escalation | Acting on another same-role user's resource | Section 7.3 | Same as #1 |
| 4 | SQL injection | Malicious input in a raw `$queryRaw` call (Section 4.3, 4.4.1, 4.4.3 all use `$queryRaw`) | Every raw query in Section 4 uses Prisma's tagged-template parameterization (`` $queryRaw`...${value}...` ``), which parameterizes automatically — string concatenation into a raw query is never used and is a blocking code-review defect if introduced | Section 20.4 test: SQLi payloads in every string input field (description, address, search/filter params) produce a normal validation error or empty result, never a query error or data leak |
| 5 | XSS | Stored XSS via `Booking.description`, `Review.writtenFeedback`, or admin broadcast `Notification.body` rendered unescaped in the Vue frontend | Vue's default template interpolation (`{{ }}`) HTML-escapes automatically; the frontend must never use `v-html` on any user-supplied field from this list — this is a frontend-code rule enforced in Section 19.6, not just a backend one. Backend additionally strips control characters from free-text fields at validation time | Section 20.4 test: `<script>`/HTML payloads in description/feedback/notification fields render as literal text, not executed, in the frontend |
| 6 | CSRF | Forged cross-site request riding the refresh-token cookie | Section 6.1: `SameSite=Strict` on the refresh cookie plus the access token traveling only via `Authorization` header (never a cookie) — a cross-site request cannot attach a valid bearer token | Section 20.4 test: a cross-origin form POST to `/auth/refresh` does not carry the cookie (verified via browser same-site cookie behavior, not server-testable alone) |
| 7 | SSRF | A future feature accepting a user-supplied URL (e.g., an avatar-by-URL field) that the server fetches | No current endpoint in Section 4.2 accepts a server-fetched URL; this is a standing prohibition — any future endpoint that would need to fetch a user-supplied URL must validate against a strict allowlist of hosts and block private/link-local IP ranges before implementation, not after | Design-time review checklist item in Section 20.1, not a runtime test until such a feature exists |
| 8 | Malicious uploads | A worker uploads an executable disguised as a certification PDF/image | Section 16: allowlisted extensions/MIME by content-sniffing (not the browser-supplied `Content-Type`), size limits, private storage, malware-scan abstraction before a document is marked usable | Section 20.4 test: uploading a renamed `.exe`/`.sh` as `.pdf` is rejected by content-sniffing before storage |
| 9 | JWT attacks (alg confusion, none-algorithm, expired-token reuse) | Forged or expired token accepted by a misconfigured verifier | `jsonwebtoken.verify` is called with an explicit `algorithms: ["HS256"]` allowlist (never trusting the `alg` header from the token itself) and checks `exp` automatically; `tokenVersion` mismatch (Section 6.3, 6.4) additionally rejects tokens that are cryptographically valid but have been revoked | Section 20.4 test: a token signed with `alg: none` or a different secret is rejected; an expired token is rejected; a token from before a `logout-all` is rejected despite a valid signature and unexpired `exp` |
| 10 | Replay attacks | Reusing a captured refresh token or a captured accept-offer request | Section 6.3 refresh-token reuse detection; Section 4.9 idempotency keys make a replayed mutation safe (return the original result) rather than double-executing | Section 20.4 test: presenting an already-rotated refresh token triggers full family revocation |
| 11 | Race conditions | Two workers accepting one booking; two redemption requests draining the same balance | Section 11.2 Redis atomic lock + Prisma transaction for dispatch acceptance; Section 13.3 `SELECT ... FOR UPDATE` for wallet redemption | Section 20.5 concurrency tests (also listed in Section 5.3) |
| 12 | API abuse | Scripted high-volume calls to any endpoint | Section 4.10 per-route rate limits | Section 20.4 test: exceeding a route's limit returns 429 |
| 13 | Wallet manipulation | Forged ledger entries, negative balances, direct balance edits | Section 13: ledger is append-only (no `UPDATE`/`DELETE` on `CreditTransaction` amounts), balance is always derived by summation (never a stored mutable counter), redemption is balance-checked inside a locked transaction | Section 20.4/20.5 tests: attempting to redeem more than the derived balance returns 409; no code path issues a raw `UPDATE credit_transactions SET amount` |
| 14 | GPS spoofing | A worker's client reports a fabricated location to appear closer to high-value jobs or fake an on-site arrival | Section 12.6: plausibility check (reject a location update implying a speed impossible in the elapsed time since the last accepted ping) and staleness/authorization checks; this is a best-effort heuristic, not cryptographic proof of location, and is documented as such — GPS spoofing on a consumer device cannot be fully eliminated without hardware attestation, which is out of scope | Section 20.4 test: a location update implying >150km/h ground speed since the last accepted ping is rejected and flagged |
| 15 | Fake reviews / fake bookings | A customer and worker collude to submit a fabricated completed booking and 5-star review to mint Feedback Credit | `Review.bookingId` is `@unique` (one review per booking, already in the schema) and a review can only be submitted against a booking the reviewing customer actually owns and that reached `COMPLETED` through the real state machine (Section 7.3, Section 11); an admin fraud-review workflow (Section 15.7) allows retroactive `REVERSAL` of a fraudulently issued `FEEDBACK_CREDIT` transaction, since ledger entries are never deleted, only reversed | Section 20.4 test: attempting a second review on the same booking returns 409; a full collusion-detection system (pattern analysis across many bookings) is explicitly out of scope for this PRD and flagged as a future enhancement, not a Version 2.0 requirement |
| 16 | Admin abuse | A rogue or compromised admin account mass-suspends customers, force-assigns bookings to a colluding worker, or edits commission rates for personal gain | Every sensitive admin action is audit-logged with actor id, reason (where the route requires one, Section 4.11), and timestamp, and audit logs are immutable and admin-inaccessible-to-delete (Section 3.2); `PATCH /admin/config` additionally requires `isSuper = true` (Section 15.6), narrowing the blast radius of a single compromised non-super admin account | Section 20.4 test: a non-super admin token against `PATCH /admin/config` returns 403; every audited action appears in `GET /admin/audit-logs` (Section 15.8) |
| 17 | WebSocket abuse | Unauthenticated socket connections, room-joining as an arbitrary `bookingId`/`workerId` to eavesdrop on another user's dispatch stream, or connection flooding | Section 12.2: sockets authenticate at handshake with the same JWT as HTTP; Section 12.3: room joins are server-validated against the connected user's own ownership (a customer can only join `booking:{id}` for their own bookings, a worker only `worker:{their own id}`), never client-declared; connection-rate limiting via the same Redis-backed limiter as Section 4.10, keyed by IP for the handshake | Section 20.4 test: a socket presenting no/invalid JWT is disconnected at handshake; a valid worker token attempting to join another worker's private room is rejected server-side |

---

## Section 10: Database Production Hardening

`IMPLEMENTATION REQUIRED`. Sections 3.2–3.4 already carry the per-model constraint audit, transaction rules, and referential-integrity notes; this section adds the remaining operational database requirements not tied to a specific model.

- **Connection pooling:** Supabase's pooled connection string (PgBouncer, transaction mode) is used for `DATABASE_URL` (application runtime queries); the unpooled `DIRECT_URL` (already present in the `datasource` block, Section 3) is used only for `prisma migrate` commands, which need a direct connection. Prisma's own connection pool (`connection_limit` in the pooled URL) is sized to the deployment's expected concurrency, not left at the client default, and is documented in `DEPLOYMENT.md` (Section 26).
- **Query optimization:** every query added during implementation that filters or sorts on a column without a matching index from Section 3.2's audit table is a defect caught in code review, not discovered later via slow-query logs; Supabase's built-in query performance advisor is checked after the E2E test pass (Section 20) and before staging deployment (Section 21.3) as a standing checklist item.
- **Migration rollback:** every `prisma migrate dev` migration is paired with a manually verified rollback path before it is applied to staging — Prisma does not auto-generate down-migrations, so a destructive migration (column drop, type change) is preceded by a data-safety review confirming the previous migration state can be restored from a pre-migration backup (Section 23.6) if the new migration needs to be reverted.
- **PostgreSQL is the sole durable source of truth; Redis is coordination/cache only** — restated here as the section this rule most concretely governs (originally stated in Section 3.3 rule 1): the booking-accept lock (Section 11.2), the location-ping debounce key (Section 1.3.4), and the service-catalog/platform-stats caches (Sections 1.1.1, 1.1.3) are the only things this system ever writes to Redis, and every one of them is either reconstructable from Postgres or safely lossy (a lost cache entry just means the next read recomputes it; a lost dispatch lock is handled by Section 11.4's reconciliation sweep, not by treating Redis as authoritative).

---

## Section 11: Booking and Dispatch — Concurrency, Legal Transitions, Failure Recovery

`IMPLEMENTATION REQUIRED`. This section is the full production specification for the booking state machine and continuity dispatch engine introduced in Sections 1.0 and 4.4. Nothing here changes the state names, the dispatch phases, or the continuity-scoring approach — it adds the actor/transaction/locking/audit/notification/socket/failure-recovery detail the audit found underspecified, and the two corrections from Section 4.12.

### 11.1 Legal Transition Table (Actor, API, Effects)

| From | To | Allowed actor | Triggering endpoint | Transaction scope | Audit event | Notification | Socket event |
|---|---|---|---|---|---|---|---|
| — | `REQUESTED` | CUSTOMER (own booking only) | `POST /bookings/request` | Section 4.3 (single insert + audit row) | `BOOKING_CREATED` | none yet (no worker assigned) | none yet |
| `REQUESTED` | `DISPATCHING_TOP3` | SYSTEM (dispatch engine, enqueued immediately after creation) | internal (`enqueueDispatch`, Section 4.4.3) | Section 4.4.5 guard | `BOOKING_STATUS_CHANGED` | none | `dispatch:update` (phase TOP3) |
| `DISPATCHING_TOP3` | `ASSIGNED` | WORKER (the specific offered worker, via the accept path) | `POST /dispatch/:dispatchLogId/respond` (ACCEPT) | Section 4.4.4 (Redis lock + Prisma transaction) | `BOOKING_ACCEPTED` | customer notified "worker assigned" | `dispatch:update` (phase ASSIGNED) |
| `DISPATCHING_TOP3` | `DISPATCHING_POOL` | SYSTEM (all 3 sequential offers exhausted without acceptance) | internal (`enqueueDispatch`, Section 4.4.3) | Section 4.4.5 guard | `BOOKING_STATUS_CHANGED` | customer notified "still searching" | `dispatch:update` (phase POOL) |
| `DISPATCHING_TOP3` or `DISPATCHING_POOL` | `CANCELLED` | CUSTOMER (own booking) or SYSTEM (pool exhausted, Section 11.4) | `POST /bookings/:id/cancel` or internal timeout | Section 4.4.5 guard | `BOOKING_STATUS_CHANGED` (metadata notes cancel source) | affected worker(s) notified offer withdrawn | `dispatch:exhausted` or `booking:cancelled` |
| `DISPATCHING_POOL` | `ASSIGNED` | WORKER (any pool candidate, first to accept) | `POST /dispatch/:dispatchLogId/respond` (ACCEPT) | Section 4.4.4 | `BOOKING_ACCEPTED` | customer notified | `dispatch:update` |
| any non-terminal | `ASSIGNED` (override) | ADMIN | `POST /admin/bookings/:id/force-assign` | same acceptance transaction pattern as 4.4.4, `attemptNumber = ADMIN_OVERRIDE` | `ADMIN_FORCE_ASSIGN` (reason required) | both customer and newly assigned worker notified | `dispatch:update` |
| `ASSIGNED` | `CONFIRMED` | SYSTEM (60s auto-confirm, Section 4.4.4) or CUSTOMER (explicit confirm, if added) | internal `setTimeout` today — see 11.4 for the durability fix | Section 4.4.5 guard | `BOOKING_STATUS_CHANGED` | none | none |
| `ASSIGNED` or `CONFIRMED` | `CANCELLED` | CUSTOMER or WORKER (own booking) or ADMIN | `POST /bookings/:id/cancel` | Section 4.4.5 guard, plus `WorkerProfile.availabilityStatus` reset to `AVAILABLE` if a worker was assigned | `BOOKING_STATUS_CHANGED` | the other party notified | `booking:cancelled` |
| `CONFIRMED` | `IN_PROGRESS` | WORKER (`assignedWorkerId === req.user`'s worker profile) | `PATCH /bookings/:id/start` | Section 4.4.5 guard | `BOOKING_STARTED` | customer notified | `dispatch:update` |
| `IN_PROGRESS` | `COMPLETED` | WORKER (`assignedWorkerId` match) | `PATCH /bookings/:id/complete` | Section 4.5 (`completeBooking`, creates Invoice) | `BOOKING_COMPLETED` | customer notified "rate your service" | `dispatch:update` |
| `COMPLETED` | `SETTLED` | CUSTOMER (via review submission — the only trigger, since there is no gateway callback) | `POST /bookings/:id/review` | Section 4.5 (`submitReview`), corrected per Section 4.12 item 1 to call the shared guard with an injected `tx` | `REVIEW_SUBMITTED` then `BOOKING_STATUS_CHANGED` | worker notified of review/rating and any Feedback Credit issued | none required |

Illegal transitions (any pair not listed above, e.g. `REQUESTED -> IN_PROGRESS` or `SETTLED -> anything`) are rejected by the Section 4.4.5 guard with `409` and `code: "ILLEGAL_TRANSITION"`, regardless of which actor attempts them — the guard is the single enforcement point; no controller is permitted to write `Booking.status` directly.

### 11.2 Preventing Double Assignment and Race Conditions

Already specified in Section 4.4.2 (Redis `SET NX PX` lock) and Section 4.4.4 (the accepting transaction re-checks `booking.assignedWorkerId` is still null before committing). This is a two-layer defense: the Redis lock stops a second worker's accept request from even reaching the database check in the common case, and the in-transaction `assignedWorkerId` check plus the new `version` optimistic-concurrency column (Section 3, added to `Booking` in this pass) stop it even if the Redis lock were somehow bypassed (e.g., a lock-TTL edge case). Both layers must exist; neither alone is sufficient in a distributed deployment with more than one API server process.

### 11.3 Preventing Duplicate Completion and Duplicate Requests

- **Duplicate completion:** `completeBooking` (Section 4.5) already checks `booking.status !== 'IN_PROGRESS'` and returns `409` otherwise — a second `complete` call cannot create a second `Invoice` because the status guard fails on the retry. Section 4.9 adds the `Idempotency-Key` layer on top so a legitimate client retry (network timeout, not a duplicate user action) gets the original success response instead of a confusing `409`.
- **Duplicate booking requests:** the `Idempotency-Key` header on `POST /bookings/request` (Section 4.9) is the primary defense against a network-retried double-submit. As a secondary, UX-level defense (not a hard server constraint, since a customer legitimately can want two simultaneous different bookings), the frontend disables the submit button immediately on click until the response returns.

### 11.4 Failure Recovery: Dispatch Durability

`IMPLEMENTATION REQUIRED` — this is the Non-Production gap flagged in Section 0.2. The Section 4.4.3 sequential offer loop (`runSequentialOfferQueue`, `waitForResponseOrTimeout`) holds its waiting state in an in-process `Promise`/`setTimeout` chain. If the API server process restarts while a booking is mid-dispatch (crash, deploy, autoscale-down), that in-memory wait is lost — the booking is left sitting in `DISPATCHING_TOP3`/`DISPATCHING_POOL` with an `OFFERED` `DispatchLog` row that will never time out or advance, because the `setTimeout` that would have flipped it to `TIMEOUT` no longer exists.

**Required mitigation — dispatch reconciliation sweep:** a scheduled job (every 30 seconds, implemented with `node-cron` or a Redis-backed job queue such as BullMQ if one is already introduced for other scheduled work, e.g. the incentive-expiry cron in Section 1.2.5) scans for `DispatchLog` rows where `outcome = 'OFFERED'` and `offeredAt` is older than the applicable timeout (`PlatformConfig.top3TimeoutSeconds` or `poolTimeoutSeconds`) using the `(outcome, offeredAt)` index added in Section 3. For each stale row found, the sweep applies the same timeout logic the in-memory `setTimeout` would have applied (mark `TIMEOUT`, advance the booking per Section 11.1's transition table) — making the dispatch engine self-healing across restarts instead of relying solely on the in-process timer. The in-process timer remains as the fast path for the common case (no restart); the sweep is the correctness backstop, not a replacement.

**Required mitigation — auto-confirm durability:** the same reconciliation approach applies to the 60-second `ASSIGNED -> CONFIRMED` auto-confirm `setTimeout` in Section 4.4.4 — the sweep additionally auto-confirms any `Booking` in `ASSIGNED` status for more than 60 seconds past `updatedAt`, so a server restart during that window does not strand a booking in `ASSIGNED` indefinitely.

### 11.5 Continuity Dispatch Engine — Full Specification

Restating and completing Section 4.4.1's scoring query as an explicit checklist (all already implemented in the Section 4.4.1 SQL, corrected per Section 4.12 item 2):

| Dimension | How it is applied |
|---|---|
| Eligibility | `WorkerSkill.verificationStatus = APPROVED` for the requested service category, and `WorkerProfile.verificationStatus = APPROVED` |
| Skill matching | `WorkerSkill.skillCategoryId = booking.serviceCategoryId` |
| Availability | `WorkerProfile.availabilityStatus = AVAILABLE` (a worker `ON_JOB`, `TRAVELLING`, or `OFF_DUTY` is never a candidate) |
| Distance | `ST_DWithin`/`ST_Distance` against `WorkerProfile.currentLocation`, bounded by `LEAST(worker's own serviceAreaRadiusKm, platform MAX_SEARCH_RADIUS_KM)` per the Section 4.12 correction |
| Continuity | prior completed/settled bookings between this exact worker and this exact customer, weighted highest in the scoring formula (Section 4.4.1: continuity term has the largest coefficient) |
| Rating / reliability | `WorkerProfile.ratingAverage` factored into the score; `ratingCount` is available for a future minimum-sample-size gate (e.g. do not let one 5-star review outweigh distance for a worker with only 1 completed job) — not implemented as a hard gate in Version 2.0, noted as a tuning knob for `PlatformConfig` rather than a fixed rule |
| Workload | implicit via `availabilityStatus = AVAILABLE` (a worker already `ON_JOB` is excluded outright rather than de-prioritized) |
| Top-3 dispatch | sequential, one at a time, 45s each (`PlatformConfig.top3TimeoutSeconds`), Section 4.4.3 |
| Wider pool | broadcast to all remaining scored candidates simultaneously, 120s window (`PlatformConfig.poolTimeoutSeconds`), Section 4.4.3 |
| Timeout | Section 11.4 sweep is now the durable enforcement, not just the in-process timer |
| Retry | a declined or timed-out offer is never re-offered to the same worker for the same booking within the same dispatch cycle (enforced structurally — each worker appears at most once across the `top3`/`pool` candidate slices per `enqueueDispatch` call) |
| Acceptance | Section 4.4.4, Redis-locked |
| Rejection | `DispatchLog.outcome = DECLINED`, immediately releases that worker back to `AVAILABLE` (no status change was made on decline, so nothing to revert) and advances the sequential queue |
| Admin override | `POST /admin/bookings/:id/force-assign`, Section 11.1 |
| Concurrency | Section 11.2 |

---

## Section 12: Location and Real-Time Hardening

`IMPLEMENTATION REQUIRED`.

### 12.1 Location Permissions and Update Frequency

Only `WORKER`-role users transmit location, and only while `availabilityStatus != OFF_DUTY` — a worker who goes off duty stops transmitting client-side and the last-known `currentLocation`/`lastLocationAt` is left in place but treated as stale (12.4) by any consumer. The frontend requests browser geolocation permission at the point the worker first toggles `available` (Section 1.2.2), not at login, and re-requests if permission was denied and the worker attempts to go available again. Update frequency: the client samples geolocation and calls `POST /workers/location-ping` at most once every 5 seconds (Section 4.10 rate limit) while `ON_JOB`, `TRAVELLING`, or `AVAILABLE`; the existing 10-second Redis debounce (Section 1.3.4) governs how often a ping actually results in a `currentLocation` write and a `worker:location` broadcast.

### 12.2 Socket Authentication

Socket.io connections authenticate during the handshake, not after: the client passes the current access token via the `auth` payload of the connection request (`io(url, { auth: { token } })`), and a Socket.io middleware (`io.use(...)`) verifies it with the same logic as the HTTP `requireAuth` middleware (Section 4.1) before the connection is accepted — an invalid, missing, or expired token is rejected at `connect` with an auth error event, and the socket is disconnected, never left connected in an unauthenticated state.

### 12.3 Room Authorization

Room membership is server-decided, never client-declared. On successful handshake, the server automatically joins the socket to the rooms that identity is entitled to: a `CUSTOMER` is joined to `booking:{id}` for each of their own non-terminal bookings; a `WORKER` is joined to `worker:{their own workerProfileId}` and to `booking:{id}` only for bookings they are currently offered on or assigned to; an `ADMIN` is joined to the admin-wide monitoring rooms (`admin:dispatch`, `admin:live-workers`). There is no client-emitted "join room" event that accepts an arbitrary room name — room joins happen exclusively in server-side handshake/event logic keyed off the authenticated identity, closing the eavesdropping vector named in Section 9 threat #17.

### 12.4 Location Privacy and Authorization

A worker's precise `currentLocation` is visible to: that worker themselves, the customer of the booking that worker is currently `ASSIGNED`/`CONFIRMED`/`IN_PROGRESS` on (and only for the duration of that booking, via the `booking:{id}` room — not a standing subscription to the worker's location in general), and `ADMIN` (Live Worker Operations, Section 1.3.4). No other customer, and no other worker, ever receives another worker's precise coordinates. The public/pre-auth landing page and the worker's own demand-heatmap (Section 1.2.6) use aggregated/clustered data (`ST_ClusterKMeans`), never individual worker positions.

### 12.5 Reconnect Behavior and Missed-Event Recovery

On Socket.io reconnect (network blip, tab backgrounding), the client re-authenticates per Section 12.2, is re-joined to its authorized rooms per Section 12.3, and immediately calls the corresponding REST snapshot endpoint to resync state that may have changed while disconnected — `GET /bookings/:id` for a customer watching a dispatch, `GET /workers/me/incoming` for a worker, `GET /admin/dispatch/active` / `GET /admin/live/workers` for admin. Socket events are treated as live deltas layered on top of REST as the source of truth for current state, not as the only source — this is why every dispatch/tracking screen in Section 1 already has a corresponding polling-capable REST endpoint (e.g. `GET /dispatch/:bookingId/candidates` in Section 4.2, explicitly noted there as "poll fallback if socket disconnects"). A dropped socket never causes permanently stale UI because reconnect always triggers a REST resync.

### 12.6 GPS Failure and Anti-Spoofing Heuristic

If the browser geolocation API errors or the worker denies permission, the client shows a non-blocking warning and the worker remains toggled `AVAILABLE` in the database but stops receiving new dispatch offers after `lastLocationAt` exceeds 120 seconds old — the continuity-scoring query's `currentLocation IS NOT NULL` and implicit recency filter (added to Section 4.4.1's `WHERE` clause during implementation: `AND wp."lastLocationAt" > now() - interval '120 seconds'`) excludes stale-location workers from candidate scoring rather than offering them a job they cannot be accurately routed to. The plausibility check named in Section 9 threat #14 (reject/flag an update implying >150km/h since the last accepted ping) runs inside the same handler that processes `POST /workers/location-ping`, before the debounced write.

### 12.7 Duplicate Event Handling

Socket events are idempotent on the client by design (`dispatch:update` always carries the full current candidate list/phase, not a delta the client must merge), so receiving the same event twice (a known Socket.io-with-reconnect edge case) simply re-renders the same state rather than corrupting it. Server-side, no business logic is triggered by a socket event from the client except the already-authenticated, already-idempotency-key-eligible REST calls (Section 4.9) — sockets in this system are receive-only for clients (server → client push); clients never emit a business-logic-triggering event over the socket, only over REST, which keeps duplicate-delivery handling entirely a rendering concern, not a data-integrity one.

---

## Section 13: Wallet and Internal Ledger Hardening

`IMPLEMENTATION REQUIRED`. No payment gateway of any kind — this section hardens the internal ledger architecture already specified in Section 1.2.4, 4.6, and 4.7 without changing its shape.

### 13.1 Ledger Immutability

`CreditTransaction` rows are never updated after creation except the single `status` field's one-way `PROCESSING -> COMPLETED | FAILED` transition (already specified in Section 1.2.4) — the `amount`, `type`, `workerProfileId`, and `referenceBookingId` fields are write-once. A correction to a past transaction is always a new row (`type: REVERSAL` or `REFUND`, with `reversesTransactionId` pointing at the original, both fields added to the schema in Section 3 during this pass), never an `UPDATE` of the original row's `amount`. No endpoint in this system issues a raw `UPDATE credit_transactions SET amount = ...` under any circumstance, including admin correction flows (Section 15.5 covers the admin adjustment endpoint, which itself only ever inserts a new `ADJUSTMENT`, `REFUND`, or `REVERSAL` row).

### 13.2 Transaction Types, Statuses, and Required Fields

| Type | Meaning | Typical status flow | Idempotency |
|---|---|---|---|
| `JOB_PAYOUT` | Worker's earned share of a completed booking, minted at settlement (Section 4.5) | created directly as `COMPLETED` | one per `referenceBookingId` (structurally, since settlement runs once per booking) |
| `FEEDBACK_CREDIT` | Commission-funded bonus for a ≥4.5-star review (Section 4.6) | created directly as `COMPLETED` | one per `referenceBookingId` |
| `INCENTIVE_BONUS` | Incentive-program payout (Section 1.2.5) | created directly as `COMPLETED` | one per incentive-progress completion event |
| `REDEMPTION` | Worker cashing out to `BANK_TRANSFER_MOCK`/`CASH_PICKUP` | `PROCESSING -> COMPLETED | FAILED` | via `CreditTransaction.idempotencyKey` (added in Section 3) and the `Idempotency-Key` header (Section 4.9) |
| `REFUND` | Customer-side reversal flowing back through the ledger when a `PaymentTransaction` is refunded (Section 14.5) | created directly as `COMPLETED`, always carries `reversesTransactionId` | one per refunded `PaymentTransaction` |
| `REVERSAL` | Admin-initiated correction of a fraudulent or erroneous prior entry (Section 9 threat #15, Section 15.7) | created directly as `COMPLETED`, always carries `reversesTransactionId` and an `AuditLog` row with `metadata.reason` | admin-initiated, one per fraud case |
| `ADJUSTMENT` | Admin manual credit/debit not tied to a booking (goodwill credit, dispute resolution) | created directly as `COMPLETED`, always carries an `AuditLog` row with `metadata.reason` | via `Idempotency-Key` (Section 4.9) |

Every row's required fields are already in the Section 3 schema (`workerProfileId`, `type`, `amount`, `status`, `createdAt`); `referenceBookingId` and `reversesTransactionId` are populated whenever the transaction traces to a specific booking or prior transaction, and left null only for the rare booking-independent `ADJUSTMENT`.

### 13.3 Balance Derivation and Concurrency

Balance is never a stored counter — Section 1.2.4 already specifies `SUM(...) - SUM(...)` derivation from `COMPLETED` transactions, and Section 4.7's `getWallet`/`redeemWallet` controllers already implement it, including the `SELECT ... FOR UPDATE` row lock during redemption to prevent two concurrent redemption requests from both reading a pre-redemption balance and both succeeding. This pass adds no change to that logic beyond wiring the `Idempotency-Key` (Section 4.9) and the `CreditTransaction.idempotencyKey` unique constraint (Section 3) as a second layer, exactly mirroring the two-layer pattern used for dispatch acceptance (Section 11.2): the row lock stops the race at the database level even without a client-supplied key; the idempotency key additionally makes a client-side retry of the same redemption request safe.

### 13.4 Preventing Wallet Abuse

- **Negative balance:** structurally impossible — `redeemWallet` (Section 4.7) checks `parsed.data.amount > balance` inside the locked transaction and rejects before any row is written; no other code path decrements a balance.
- **Duplicate redemption / double spend:** Section 13.3.
- **Replay:** Section 4.9 idempotency keys.
- **Unauthorized modification:** every `CreditTransaction` insert resolves `workerProfileId` from either the authenticated worker's own session (`req.user.id` → `WorkerProfile.userId`) for self-service redemption, or from an `ADMIN`-only route with mandatory audit reason for any other write (Section 15.5) — no endpoint accepts an arbitrary `workerProfileId` in a body from a non-admin caller.
- **Race conditions:** Section 13.3, Section 9 threat #11.

---

## Section 14: Payment Model — Manual/Demo Settlement (No Gateway)

`IMPLEMENTATION REQUIRED`. Restated for absolute clarity because this is a hard constraint repeated throughout the brief: **no Razorpay, Stripe, PayPal, UPI gateway, card gateway, bank API, or any external payment processor exists anywhere in this system, in this section or any other.** Every dollar (rupee) figure in this platform is either recorded by platform staff/customers as having changed hands outside the app (cash, direct payment) or moved between internal ledger rows (wallet). This section makes the full money-flow chain explicit end to end.

### 14.1 The Full Flow

```
Booking (Section 11)
  -> Invoice (created at booking completion, Section 4.5 — baseCharge + hourlyCharge, platformFee computed from PlatformConfig.commissionPercent)
    -> PaymentTransaction (created at review submission, Section 4.5 — paymentMethod CASH | DIRECT_PAY, paymentStatus PAID; this is a RECORD that payment occurred, not a gateway call)
      -> platform fee retained (the platformFee portion of the Invoice, kept by the platform, never entered into the worker's ledger)
      -> Worker earnings (Invoice.totalAmount - Invoice.platformFee) recorded as a JOB_PAYOUT CreditTransaction (Section 4.5, 13.2)
        -> Ledger entry (the JOB_PAYOUT row itself, plus any FEEDBACK_CREDIT/INCENTIVE_BONUS rows, Section 13.2)
          -> Redemption request (POST /workers/me/wallet/redeem, Section 4.7 — worker-initiated, PROCESSING status)
            -> Manual settlement (an admin, outside this app or via the admin console Section 15.4, actually performs a bank transfer or hands over cash)
              -> SettlementRecord (admin records what they did — payoutMethod, externalReferenceNote, Section 3 — and marks the CreditTransaction COMPLETED)
                -> Reconciliation (Section 14.6)
```

### 14.2 Customer-Side Payment Recording

Customers pay `CASH` or `DIRECT_PAY` — both are recorded by the app after the fact (typically the worker confirms receipt, or the customer/admin marks it), never processed by the app. `PaymentTransaction.paymentMethod` and `paymentStatus = PAID` are set at the point Section 4.5's `submitReview` transaction runs (today implicitly hardcoded to `paymentMethod: "CASH"` in the Section 4.5 example — Claude Code parameterizes this from a `paymentMethod` field the review-submission request or a prior "confirm payment received" step supplies, defaulting to `CASH` only if genuinely unspecified; this is a minor implementation detail, not a new endpoint). No card numbers, UPI IDs, or bank account numbers are ever collected, stored, or transmitted by this system for customer payment — the platform never touches customer payment credentials at all, only the fact and amount of a payment already made outside the app.

### 14.3 Worker-Side Redemption

`BANK_TRANSFER_MOCK` and `CASH_PICKUP` (Section 1.2.4, 4.7) are the only two `PayoutMethod` values and both are explicitly labeled manual/demo in this document and must be labeled as such in the frontend UI copy too (e.g. a redemption confirmation screen states "processed manually by the cooperative federation," not "instant transfer") — this is a UI-copy requirement added in this pass, tracked as part of Section 19's frontend production readiness.

### 14.4 Admin Manual Settlement Workflow

`PATCH /api/v1/admin/wallet/redemptions/:transactionId/settle` (new endpoint, added in this pass — JWT Admin, req `{ "payoutMethod": "BANK_TRANSFER_MOCK" | "CASH_PICKUP", "externalReferenceNote"?: string }`): inside a Prisma transaction, creates the `SettlementRecord` (Section 3), sets `CreditTransaction.status = COMPLETED` and `settledAt = now()`, and writes an `AuditLog` row (`WALLET_REDEMPTION_SETTLED`). This is the concrete implementation of the "redemptions" admin workflow named in Section 15.4.

### 14.5 Refunds and Reversals

`POST /api/v1/admin/bookings/:id/refund` (new endpoint, added in this pass — JWT Admin, req `{ "reason": string }`, reason mandatory): validates the booking has a `PaymentTransaction` with `paymentStatus = PAID`, and inside a single transaction sets `PaymentTransaction.paymentStatus = REFUNDED` with `refundedAt`/`refundReason`/`refundedByAdminId` (fields added to the schema in Section 3), and inserts a `REFUND` `CreditTransaction` with `reversesTransactionId` pointing at the original `JOB_PAYOUT` if the worker had already been credited (clawing back the ledger entry the same way any correction happens — a new offsetting row, never an edit of the original). The refund itself, like everything else in this system, is a bookkeeping record: the platform still is not moving real money through this app; an admin performing a refund is expected to separately hand back cash or otherwise settle with the customer outside the app, and this endpoint is where that fact gets recorded.

### 14.6 Reconciliation

`GET /api/v1/admin/reports/reconciliation` (new endpoint, added in this pass — JWT Admin): returns, for a date range, the count and total amount of `SettlementRecord`s with `status = PENDING` (settlements an admin recorded but has not yet double-checked against the actual bank/cash action) versus `RECONCILED`, plus any `PaymentTransaction`s with `paymentStatus = PENDING` older than 48 hours (payments that were never confirmed) as an exceptions list. `PATCH /api/v1/admin/wallet/settlements/:id/reconcile` (JWT Admin) sets `SettlementRecord.status = RECONCILED`, `reconciledByAdminId`, `reconciledAt` — the manual "I checked this against the real bank statement/cash log" action, since there is no automated bank-API feed to reconcile against in this no-gateway architecture.

### 14.7 Gateway "Coming Soon" UI State and PaymentService Adapter (Version 3.0, hackathon prototype)

`IMPLEMENTATION REQUIRED`. The user-facing payment category/option is never hidden or removed — a judge or user must be able to see that online/card/UPI payment exists as a product category, click into it, and get a clear, honest, non-broken response. This subsection is the concrete UI-state contract for that click, plus the backend abstraction boundary that keeps a real gateway addable later without touching booking, invoice, or ledger code.

**UI state.** The payment method selection screen (wherever `CASH`/`DIRECT_PAY` are offered, Section 1.1.6/1.1.7) additionally lists an "Online Payment" or "Card / UPI" option. Selecting it — never on page load, only on explicit user action — renders a dedicated state, not a toast and not a dead button:

```
   Payment Gateway Not Configured

   Online payments are coming soon. For this
   prototype, please complete your booking using
   Cash or Direct Pay — both are fully supported.

        [ Use Cash / Direct Pay instead ]
```

The screen/modal uses the translated keys `paymentGatewayNotConfigured` (heading), `paymentGatewayComingSoonBody` (body copy), and `paymentGatewayFallbackCta` (button text) — added to Section 2.2's dictionary in all four locales (EN/HI/TA/BN), no trailing periods, consistent with every other UI string in this document. The fallback button routes the user back to the existing `CASH`/`DIRECT_PAY` selection (Section 14.2) so the booking flow is never a dead end.

**Backend contract.** `POST /api/v1/bookings/:id/payment-method` (existing flow, Section 4.5/14.2) accepts `paymentMethod: "CASH" | "DIRECT_PAY" | "GATEWAY"`. When `paymentMethod = "GATEWAY"` is submitted, the endpoint does not attempt any external call — it returns `501 PAYMENT_GATEWAY_NOT_CONFIGURED` with the standard Section 4.8 error envelope (`{"error":{"code":"PAYMENT_GATEWAY_NOT_CONFIGURED","message":"Online payment is not available in this prototype; use Cash or Direct Pay.","requestId": "..."}}`) and writes no `PaymentTransaction` row — an unconfigured gateway must fail loudly and immediately, never silently record a fake `PAID` status.

**`PaymentService` adapter boundary.** Internally, every payment-method-handling code path (the endpoint above, and Section 4.5's completion/settlement flow) calls a single `PaymentService` interface rather than branching on `paymentMethod` inline, so a real gateway is a new adapter, not a rewrite:

| Adapter | Behavior | Status |
|---|---|---|
| `ManualRecordAdapter` | Handles `CASH`/`DIRECT_PAY` — records a `PaymentTransaction` for a payment that already happened outside the app (Section 14.2). No external call. | Implemented, P0 (Section 0.4) |
| `UnavailableGatewayAdapter` | Handles `GATEWAY` — returns `501 PAYMENT_GATEWAY_NOT_CONFIGURED` immediately, no external call, no side effects. This is the default/active adapter behind the "Coming Soon" UI state above. | Implemented, P1 (Section 0.4) |
| `FutureGatewayAdapter` (interface only) | Would call a real processor (Razorpay/Stripe/other) and handle its webhook/callback. Method signatures only (`initiate(amount, bookingId): Promise<GatewaySession>`, `verifyCallback(payload): Promise<PaymentTransaction>`) — no implementation, no SDK dependency added, no API keys referenced anywhere in this codebase. | Documented, not built — `OUT` (Section 0.4) |

Claude Code implements only `ManualRecordAdapter` and `UnavailableGatewayAdapter` in this pass. `FutureGatewayAdapter` exists in this document purely as the documented extension point so a later, separate effort can add a real gateway by writing one new adapter class and switching `PaymentService`'s active binding — never by touching `Booking`, `Invoice`, `CreditTransaction`, or dispatch logic, all of which remain gateway-agnostic by construction (Section 3.4).

---

## Section 15: Admin Console Production Workflows

`IMPLEMENTATION REQUIRED`. Section 1.3 already maps every admin screen to its data/API contract; this section states the production-grade behavioral rule that applies uniformly across all of them, then closes the gaps the audit found (worker suspension had no endpoint; audit-log viewing had no endpoint).

### 15.1 Uniform Rule for Every Sensitive Admin Action

Every action in the list below requires (a) a valid `ADMIN`-role JWT (Section 7.1), (b) the endpoint-level permission check already implied by `requireAdmin` plus, where noted, `isSuper` (Section 15.6), (c) an `AuditLog` row written in the same transaction as the mutation (never fire-and-forget after the response is sent), and (d) a `reason` field in the request body wherever the action materially affects another party's money, verification status, or account standing — enforced by the `400 REASON_REQUIRED` check named in Section 4.11.

| Workflow | Endpoint(s) | Reason required |
|---|---|---|
| Dashboard | `GET /admin/dashboard/summary` | n/a (read-only) |
| Worker verification | `PATCH /admin/workers/:id/verify`, `PATCH /admin/workers/:id/skills/:skillId/verify` | Yes, on `REJECTED` |
| Worker suspension/reactivation | `PATCH /admin/workers/:id/status` (new endpoint, added in this pass — req `{ "availabilityStatus": "OFF_DUTY", "suspended": boolean }`, sets availability to `OFF_DUTY` and blocks the worker from toggling back to `AVAILABLE` while `suspended = true` by adding a `WorkerProfile.suspendedAt DateTime?` field, added to the schema in Section 3) | Yes |
| Booking management / dispatch monitoring | `GET /admin/bookings`, `GET /admin/dispatch/active` | n/a (read-only) |
| Force reassignment | `POST /admin/bookings/:id/force-assign` | Yes |
| Cancellation | `POST /admin/bookings/:id/cancel` (new endpoint, added in this pass — admin-initiated cancel, same transition as Section 11.1's customer/worker cancel path) | Yes |
| Pricing / service configuration | `POST /admin/services`, `PATCH /admin/services/:id` | No (routine catalog maintenance; still audited) |
| Wallet / ledger, redemptions, reconciliation | Section 14.4–14.6 endpoints | Yes on refund, reversal, adjustment; no on routine settle/reconcile |
| Reports | `GET /admin/reports/*` | n/a (read-only) |
| Notifications (broadcast) | `POST /admin/notifications/broadcast` | No (not a punitive/financial action) |
| Audit logs | `GET /admin/audit-logs` (new endpoint, added in this pass, Section 15.8) | n/a (read-only) |
| Demo data reset | `POST /admin/demo/reset` (new endpoint, added in the Version 3.0 hackathon pass, Section 15.9) | No (a demo-operations action, not punitive/financial; still audited) |

### 15.2–15.3 Dashboard and Booking Management

Already fully specified in Sections 1.3.1–1.3.3; no changes.

### 15.4 Redemptions and Reconciliation

Section 14.4–14.6.

### 15.5 Admin Wallet Adjustment

`POST /api/v1/admin/wallet/adjustments` (JWT Admin, req `{ "workerProfileId": string, "amount": number, "direction": "CREDIT" | "DEBIT", "reason": string }`, `reason` mandatory, `Idempotency-Key` supported per Section 4.9): inserts an `ADJUSTMENT` `CreditTransaction` (amount signed by `direction`) inside a transaction with an `AuditLog` row. A `DEBIT` adjustment is still subject to the same "balance never goes negative" rule as redemption (Section 13.4) — the endpoint rejects a debit larger than the worker's current derived balance with `409 INSUFFICIENT_BALANCE`, an admin cannot force a negative ledger any more than a worker can.

### 15.6 Federation Admin Settings — Super-Admin Gate

`PATCH /api/v1/admin/config` (Section 1.3.11) additionally requires `AdminProfile.isSuper = true` — a regular admin can view config (`GET`) but not change commission rate or dispatch timeouts, since those parameters affect every worker's and every booking's economics platform-wide. This is the concrete implementation of Section 9 threat #16's mitigation.

### 15.7 Fraud Reversal Workflow

`POST /api/v1/admin/credit-transactions/:id/reversal` (JWT Admin, req `{ "reason": string }`, mandatory): inserts a `REVERSAL` `CreditTransaction` with `reversesTransactionId` pointing at the flagged row and a negated amount, inside a transaction with an audit row. This is the concrete implementation referenced by Section 9 threat #15 (fake-review-driven Feedback Credit fraud) — detecting the fraud is a manual admin review process (out of scope for automated pattern detection in this PRD, Section 9 threat #15), but reversing it once found is a first-class, audited, ledger-safe operation.

### 15.8 Audit Log Viewer

`GET /api/v1/admin/audit-logs?entityType=&entityId=&action=&actorId=&from=&to=&page=` (JWT Admin): paginated (Section 3.3 rule 5) read of the `AuditLog` table with the listed filters, `ORDER BY createdAt DESC`. This endpoint did not exist in Version 1.0 despite `AuditLog` rows being written throughout the system — every admin action, worker verification, dispatch override, and financial adjustment in this PRD is only meaningfully auditable once this read path exists, so it is treated as a required Version 2.0 endpoint, not an optional nicety.

### 15.9 Demo Data Reset (Version 3.0, hackathon prototype)

`POST /api/v1/admin/demo/reset` (JWT Admin, `isSuper = true` only — the same super-admin gate as Section 15.6, since this action discards live demo data): invokes the same seed logic as `prisma/seed.ts` (Section 19.3, 21.5) against the current database inside a transaction — truncates the demo-owned tables (every table seeded by `prisma/seed.ts`; real accounts created during a live demo session by judges/users are also demo data in this prototype and are included) and re-inserts the canonical seed dataset, then writes an `AuditLog` row (`DEMO_DATA_RESET`). This exists so a prototype demo can be run repeatedly (Section 20.2's flows, Section 29.6's acceptance checklist) without manual database surgery between runs; it is a prototype-only convenience endpoint and is explicitly out of scope for a real production build (Section 0.4 `OUT` items follow the same "documented but not built for commercial launch" pattern).

---

## Section 16: Document/KYC Storage Security

`IMPLEMENTATION REQUIRED`. `Certification.documentUrl` (Section 3) and worker identity-verification uploads (Section 1.2.1's "identity upload" field, which Version 1.0 mentioned in the frontend mapping but never specified a storage contract for) are hardened here.

### 16.1 New Model: Document Storage Reference

Claude Code adds a `Document` model to the schema (`id`, `ownerUserId` FK to User, `documentType` enum `IDENTITY_PROOF | CERTIFICATION | COOPERATIVE_ID`, `storageKey` string — the random object key described in 16.3, `originalFilename` string, `mimeType` string as detected server-side, `sizeBytes` Int, `scanStatus` enum `PENDING | CLEAN | INFECTED | SCAN_FAILED`, `uploadedAt`, `expiresAt DateTime?` for time-bound retention, `deletedAt DateTime?` for soft delete) and points `Certification.documentUrl` at a `Document.id` (foreign key) instead of a raw URL string — a raw URL string is exactly the "public storage" anti-pattern this section prohibits.

### 16.2 Allowed File Types and Size Limits

`image/jpeg`, `image/png`, `application/pdf` only. Maximum 10MB per file, maximum 5 files per worker per document type. Any other MIME type or an oversized file is rejected with `400` before upload proceeds to storage.

### 16.3 Filename Sanitization and Random Object Keys

The `originalFilename` is stored as metadata only (for display) and never used to construct a storage path. The actual object key is a server-generated random UUID plus the validated extension (e.g. `documents/{uuid}.pdf`) — this eliminates path-traversal and filename-collision attack surface entirely, since the untrusted filename never touches the filesystem/object-store path.

### 16.4 Private Storage, Never Public

Documents are stored in a Supabase Storage bucket configured **private** (no public read policy). There is no code path, endpoint, or configuration in this system that serves a document via a permanent public URL — public bucket storage for KYC documents is a standing prohibition, not a default to be careful with.

### 16.5 Signed Temporary URLs

`GET /api/v1/workers/documents/:id/signed-url` (JWT Provider — own documents only, per Section 7.3's ownership pattern; or JWT Admin — any worker's documents, for verification review) issues a Supabase Storage signed URL with a 5-minute expiry. The frontend never constructs or caches a long-lived document URL; every view/download re-requests a fresh signed URL.

### 16.6 Malware-Scanning Abstraction

Upload flow: file lands in a quarantine prefix within the private bucket → `Document.scanStatus = PENDING` → an async scan step runs against a `MalwareScanner` interface (`scan(objectKey: string): Promise<'CLEAN' | 'INFECTED' | 'SCAN_FAILED'>`) → on `CLEAN`, the object is moved/re-tagged out of quarantine and `scanStatus` updated; on `INFECTED`, the object is deleted immediately and the worker is notified their upload was rejected; on `SCAN_FAILED`, the document stays quarantined (never served, never counted as a valid submitted document) and an admin alert fires. **The Version 2.0 implementation is a stub scanner** (`SCAN_FAILED` fallback disabled in dev, `CLEAN` returned immediately) — this is intentionally mocked (Section 0 legend: `IMPLEMENTATION REQUIRED` for the interface and wiring, explicitly **not required** for a real antivirus engine integration in this PRD's scope) but the interface boundary, the quarantine step, and the `scanStatus` gate must all exist so a real scanner (ClamAV, a cloud AV API) can be substituted later without changing any caller. No document with `scanStatus` other than `CLEAN` is ever returned by the signed-url endpoint (16.5) or used to auto-approve a worker (Section 1.3.5's verification flow requires `scanStatus = CLEAN` on every referenced `Document` before an admin can even see it in the review queue).

### 16.7 Browser MIME Type Is Never Trusted

The `Content-Type` header/MIME type the browser supplies on upload is advisory only. The server determines the real file type by content-sniffing the first bytes (magic-number check — e.g. via `file-type` npm package) and rejects a mismatch (a file claiming `image/png` whose bytes don't match) with `400`, independent of and prior to the malware scan.

### 16.8 Retention and Deletion

Identity documents are retained for the duration of the worker's active `WorkerProfile` plus 90 days after `verificationStatus` transitions away from `APPROVED` permanently (i.e. the account is suspended/deleted) to support dispute resolution, then soft-deleted (`Document.deletedAt` set, object removed from storage by a scheduled cleanup job) — this ties into Section 17.5's general retention policy. A worker may request early deletion of a specific document (e.g. they re-uploaded a corrected copy) via `DELETE /api/v1/workers/documents/:id` (new endpoint — own documents only), which soft-deletes the DB row and removes the storage object, provided the document is not the sole evidence backing a currently `APPROVED` verification (in which case the request is rejected with `409` until a replacement is uploaded).

---

## Section 17: Privacy and Data Handling

`IMPLEMENTATION REQUIRED`.

### 17.1 Data Collection and Purpose

Every field this system collects maps to a stated purpose already implied by its use in Sections 1–16: identity fields (name, email, phone) for account and contact; address/location for service dispatch and routing; documents for worker verification (Section 16); precise GPS for active-job routing and continuity scoring (Section 12), never for standing surveillance. No field is collected "for future use" without a named current purpose — if implementation adds a field not traceable to a requirement in this document, that is a scope violation to flag, not silently ship.

### 17.2 Consent

Registration (`POST /auth/*/register`, Section 6.2) requires an explicit `acceptedTermsAt` timestamp (field added to `User` in this pass — a boolean checkbox in the frontend register form that the backend refuses to proceed without, `400 TERMS_NOT_ACCEPTED`). Location permission consent is the browser's native geolocation prompt (Section 12.1) — the system never attempts to infer or fall back to location without that OS/browser-level grant.

### 17.3 Location Privacy

Fully specified in Section 12.4 — repeated here as the privacy-policy cross-reference: precise worker location is visible only to that worker, their currently assigned customer, and admin; never to unrelated customers or workers; never persisted beyond the operational need (no historical location trail is retained past what `WorkerProfile.currentLocation`/`lastLocationAt` — a single current value, not a log table — captures; if a location history/breadcrumb feature is added later, it needs its own retention policy, out of scope here).

### 17.4 Retention, Deletion, Access, Correction, Export

- **Access:** `GET /api/v1/users/me/data-export` (new endpoint, added in this pass — JWT Customer/Provider/Admin, own data only): returns a JSON export of the requesting user's `User`, profile, bookings, reviews, and non-financial-ledger-detail wallet summary — this is the "access" and "export" requirement combined, satisfying a data-subject access request without a separate admin step.
- **Correction:** `PATCH /users/me` (Section 1.2.9) already covers self-service correction of editable fields; corrections to immutable audit-relevant fields (past booking descriptions, submitted reviews) are intentionally not user-editable, consistent with Section 3.2's "reviews are immutable" note — a correction request for those goes through admin support, not a self-service edit.
- **Deletion:** `POST /api/v1/users/me/delete-request` (new endpoint — JWT Customer/Provider/Admin, own account): sets `User.deletedAt` (soft delete, Section 3), immediately revokes all sessions (Section 6.4 logout-all behavior), and anonymizes `fullName`, `email`, `phone`, `avatarUrl` to placeholder values while preserving the row itself and its id for every `Booking`/`Review`/`CreditTransaction`/`AuditLog` foreign key that must survive for financial and audit integrity (Section 3.4's referential-integrity rule) — this is deletion in the data-protection sense (the person's identifying data is gone) without breaking the ledger (the transaction history remains attributable to a now-anonymous account). A worker with `verificationStatus = APPROVED` and a currently `ASSIGNED`/`IN_PROGRESS` booking cannot self-delete until that booking reaches a terminal state (`409 ACTIVE_BOOKING_EXISTS`).
- **Retention:** documents per Section 16.8; audit logs are retained indefinitely by default (they are the system's fraud/dispute evidence trail) with actual retention period a business/legal decision to be set in `PlatformConfig` and documented in `SECURITY.md` (Section 26) rather than hardcoded here; notification history (Section 18) is retained 12 months then purged by a scheduled job.

### 17.5 Privacy-Safe Logging

Section 8.6 is the concrete specification; this section is the policy statement it implements: application logs are operational data, not a secondary copy of personal data, and are treated with the same care as the primary database — no log line is a backdoor around the access controls specified in Sections 6–9.

### 17.6 Never Logged, Restated

Passwords (plaintext or hash), JWT/refresh/OTP/reset token raw values, uploaded document contents or their signed URLs, and precise GPS coordinates beyond the single current-location value already permitted by Section 12.4 — none of these ever appear in application logs, error messages, or `AuditLog.metadata` (audit metadata records the *fact* of an action, e.g. `{ "documentId": "..." }`, never the sensitive payload itself).

---

## Section 18: Notifications Abstraction

`IMPLEMENTATION REQUIRED`. Section 1.3.10 and the `Notification` model (Section 3) already cover in-app notifications and admin broadcast; this section specifies the channel abstraction so email/SMS/push can be added later without a redesign, per the instruction not to force an external provider into the base implementation.

### 18.1 Interface

A `NotificationChannel` interface (`send(notification: { userId, title, body, data? }): Promise<'SENT' | 'FAILED'>`) is implemented by:

- `InAppChannel` (the only channel wired to a real backend in Version 2.0 — writes the `Notification` row already specified in Section 3 and emits a `notification:new` Socket.io event to the user's personal room)
- `EmailChannel` — interface implemented, but the concrete sender is a stub (`console.log`/no-op in development, an injectable `EMAIL_PROVIDER` env-gated no-op in production until a real provider is chosen) — "email-ready," not "email-wired"
- `SmsChannel` — same stub pattern, "SMS-ready"
- `PushChannel` — same stub pattern, "push-ready"

A `NotificationDispatcher` service fans a single logical notification event out to whichever channels are enabled for that notification type and that user's preferences (Section 1.2.9's `UserPreference` gains an optional `notificationChannels: string[]` field, default `["IN_APP"]`), always including `InAppChannel` regardless of preference (in-app is never optional — it is the guaranteed-delivery baseline this system commits to without a third-party dependency).

### 18.2 Retry and Deduplication

A failed channel send (any channel returning `'FAILED'`, relevant once a real Email/SMS/Push provider is wired in) is retried up to 3 times with exponential backoff via the same scheduled-job mechanism as Section 11.4's reconciliation sweep, then marked permanently failed and surfaced to admin monitoring (Section 22.2) rather than retried forever. Deduplication: each logical notification event carries a stable idempotency-style key (e.g. `booking:{id}:assigned`) so a retried dispatch (server restart mid-fan-out) does not create a second in-app `Notification` row for the same event — enforced by a unique constraint on `(userId, dedupeKey)` where `dedupeKey` is populated for system-generated notifications (not required for free-text admin broadcasts, which have no natural dedupe key).

### 18.3 Read/Unread and Preferences

Already specified in Section 1.2.9 (`markNotificationRead`, `markAllNotificationsRead`, the `(userId, isRead)` index added in Section 3). Preferences extend `PATCH /users/me/preferences` to also accept `notificationChannels`.

### 18.4 Failure Handling

A channel being fully unconfigured (no real provider chosen yet) is not an error state — `EmailChannel`/`SmsChannel`/`PushChannel` in their stub form always return `'SENT'` in development (so notification-dependent flows are testable end-to-end without a real provider) and are explicitly disabled (skipped, not attempted) in production until a real provider is configured via environment variables, at which point they begin actually sending and their real failure/retry path (18.2) activates.

---

## Section 19: Frontend Production Readiness

`IMPLEMENTATION REQUIRED`. Consolidates and extends Section 1.4.

### 19.1 Screen State Matrix

Section 1.4's table is the complete requirement; this section adds the enforcement mechanism: a shared Vue composable (`useAsyncState` or equivalent) wraps every API-backed data fetch and exposes `{ data, loading, error, empty, retry }` uniformly, so every screen listed in Section 1 implements the same five states through the same primitive rather than five different ad hoc patterns per screen.

### 19.2 Client-Side Dispatch Simulation Removal — Enforcement (mock data itself retained)

Reversed from Version 2.0 for this hackathon pass (Section 1.4): mock data is not removed. What is still enforced as a CI-checkable gate (Section 21.4) is narrower — the build pipeline greps the built frontend bundle for the strings `simulateWorkerAcceptancePathA`, `simulateNoResponsePathB`, `simulatePoolWorkerAcceptance` and fails the build if any are found, so the fake client-side dispatch *timer logic* never ships even though the underlying seed *data* does. The string `mockData` itself is explicitly excluded from this grep — `window.mockData` may legitimately appear in dev-tooling or seed-adjacent code paths, and the frontend calling the real API (Section 4.2) is what matters, not the literal absence of the string.

### 19.3 Seed Data (Development, Staging, and Prototype Deployment)

`mockData.js`'s content (cooperatives, services, sample workers/customers/bookings, reviews) is the input to a backend seed script (`prisma/seed.ts`, Section 21.5) that populates the database — for this prototype, that includes the publicly deployed prototype environment itself, not only development/staging, since a hackathon demo depends on the deployed instance having realistic data from the moment it's shown to a judge. The seed dataset covers customers, workers, admins, services/categories, bookings across every lifecycle stage (Section 1.0), skills, service-area locations, reviews, notifications, wallet/ledger history, and incentive/Feedback Credit rows — realistic Indian names, cities, and service categories, not `Test User 1`/`Lorem Ipsum` placeholders, so the demo reads as a plausible real platform. Section 15.9's `POST /admin/demo/reset` re-runs this same script on demand.

### 19.4 Every Frontend Call Maps to a Defined Backend API

Restating Section 1.4's mapping rule: the implementation order (PHASE 12, Section 28) treats "every `fetch`/axios call in `app.js` has a corresponding row in Section 4.2 or 4.11" as an exit criterion for the frontend-integration phase.

### 19.5 Responsive and Loading Performance

Already governed by Section 1.4's Responsive row and Section 24 (performance targets) — no new requirement here beyond the cross-reference.

### 19.6 XSS-Safe Rendering

Restating Section 9 threat #5 as a frontend build rule: `v-html` is never used on `Booking.description`, `Review.writtenFeedback`, `Notification.body`, or any other user-or-admin-supplied free-text field — standard `{{ }}` interpolation only. A `v-html` usage on any of these fields found in code review is a blocking security defect.

---

## Section 20: Testing Strategy

`IMPLEMENTATION REQUIRED`.

### 20.1 Test Levels

| Level | Scope | Tooling |
|---|---|---|
| Unit | Pure functions: continuity-scoring math, ledger balance derivation, validation schemas, state-machine legal-transition table lookups | Jest/Vitest |
| Integration | A controller against a real (test-database) Prisma client and a real Redis instance — no mocked ORM | Jest/Vitest + a disposable Postgres/Redis via Docker Compose or Supabase branch |
| API | Every route in Section 4.2/4.11 exercised over HTTP against a running server instance | Postman/newman (Section 5.1), extended per 5.3 |
| E2E | Full user journeys through the real frontend against the real backend | Playwright (the sandbox already has Playwright configured, per this environment's own tooling notes) |
| Security | Section 9's threat table, executed as concrete test cases (20.4) | newman + Playwright + manual pentest checklist |
| Load | Section 24 targets validated under synthetic concurrent load | k6 or Artillery, staging only |
| Failure/recovery | Section 20.5 | manual + scripted fault injection |

### 20.2 Minimum End-to-End Flows

These three flows are the acceptance bar for "the backend works," restated verbatim from the audit brief and mapped onto this PRD's concrete endpoints:

- **CUSTOMER:** `POST /auth/customer/register` → `POST /auth/customer/login` → `POST /bookings/request` → dispatch (`dispatch:update` socket stream, Section 11) → `ASSIGNED` (Section 11.1) → tracking (`GET /bookings/:id`, socket updates) → `COMPLETED` (worker-side) → `POST /bookings/:id/review`.
- **WORKER:** `POST /auth/worker/register` → admin `PATCH /admin/workers/:id/verify` (APPROVED) → `PATCH /workers/me/availability` (AVAILABLE) → dispatch offer received (`dispatch:offer` socket event) → `POST /dispatch/:dispatchLogId/respond` (ACCEPT) → `PATCH /bookings/:id/start` → `PATCH /bookings/:id/complete` → `GET /workers/me/wallet` (JOB_PAYOUT visible) → `POST /workers/me/wallet/redeem`.
- **ADMIN:** `POST /auth/admin/login` → `PATCH /admin/workers/:id/verify` → `GET /admin/dispatch/active` → `POST /admin/bookings/:id/force-assign` → `PATCH /admin/wallet/redemptions/:transactionId/settle` → `GET /admin/audit-logs` (confirming every prior action produced a row).

Each flow is implemented as one Playwright E2E spec (frontend-driven) and one newman collection run (API-only, extending Section 5.1) — both must pass; the API-only run catches backend regressions faster, the Playwright run catches frontend-integration regressions (Section 19.4).

### 20.3 Test Data Isolation

E2E and integration tests never run against the production or staging database — a dedicated test database (a Supabase branch, per the Supabase MCP tooling's `create_branch` capability, or a local Dockerized Postgres+PostGIS) is created fresh per test run and torn down after, seeded via the same `prisma/seed.ts` named in Section 19.3.

### 20.4 Security Test Matrix

The executable form of Section 9's mitigation column — one test per numbered threat, already described alongside each threat in that table's "Verified by" column. Collected here as the checklist Claude Code runs before considering the backend production-ready: all 17 threats in Section 9 have a corresponding passing test before PHASE 13 (Testing, Section 28) is marked complete.

### 20.5 Failure and Recovery Tests

Restating and completing Section 5.3's list as the formal requirement:

| Scenario | Expected behavior |
|---|---|
| Two workers accept one booking concurrently | Exactly one `200 ACCEPTED`, one `409 LOCK_LOST` or `ALREADY_ASSIGNED` (Section 11.2) |
| Two simultaneous redemption requests exceeding balance together but not individually | Exactly one `200 PROCESSING`, one `409 INSUFFICIENT_BALANCE` (Section 13.3) |
| Duplicate booking request (same Idempotency-Key, same body) | Second request returns the first request's stored response, no second row created (Section 4.9) |
| Duplicate payment/invoice record attempt (retry `PATCH /bookings/:id/complete`) | Second call is a safe no-op returning the original result via idempotency, never a second `Invoice` (Section 11.3) |
| Duplicate review submission | Second `POST /bookings/:id/review` on the same booking returns `409` (`Review.bookingId` unique constraint, Section 9 threat #15) |
| Server restart during an in-flight dispatch | Section 11.4 reconciliation sweep resumes/cancels the stranded booking within one sweep interval (30s) of the server coming back up |
| Redis unavailable | New dispatch offers pause (cannot acquire locks) rather than double-assigning; already-served cached reads (service catalog, stats) fall back to a live Postgres query; the API does not crash or 500 on every request (Section 3.3 rule 1, Section 10) |
| Database unavailable | Health check (Section 22.1) reports `not ready`; in-flight requests fail with `503`, not a raw connection-error stack trace (Section 8.5); the process does not crash-loop |
| Socket disconnect mid-dispatch | Section 12.5 reconnect + REST resync delivers current state, no stale UI |

---

## Section 21: CI/CD Pipeline

`IMPLEMENTATION REQUIRED`.

### 21.1 Pipeline Stages

Every push and pull request runs, in order, failing fast on the first red stage: **lint** (ESLint + Prettier check) → **typecheck** (`tsc --noEmit`) → **unit tests** → **`prisma validate` + `prisma format --check`** (schema stays syntactically valid and consistently formatted) → **dependency audit** (`npm audit --audit-level=high`, or equivalent; a new high/critical vulnerability fails the build) → **integration tests** (against an ephemeral test database, Section 20.3) → **build** (`tsc` compile for the backend, Vite/whatever bundler for the frontend) → **E2E tests** (Section 20.2, against the freshly built artifacts) → **security checks** (Section 20.4's automated subset — the manual pentest-checklist items are not CI-blocking but are tracked as a release-checklist item, PHASE 13 of Section 28).

### 21.2 Environment Promotion

Full form: `development` (local, or ephemeral preview per PR) → `staging` (auto-deployed on merge to `main` after CI passes) → `production` (manually promoted from a specific staging build that has passed the Section 20 full suite including load testing, never auto-deployed from a raw commit). **Prototype-scope simplification (P2, Section 0.4):** a single deployable environment — `development` (local) → `deployed prototype` (the public URL judges access, auto- or manually deployed on merge to `main` after CI's lint/typecheck/unit/integration/build stages pass) — is acceptable for this hackathon pass; the intermediate `staging` tier and load-testing gate are not required to be built, though the promotion-blocked-by-CI-status rule still applies: there is no path to deploy a commit whose pipeline has not gone green.

### 21.3 Staging as a Production Gate

Full enterprise form retained as the documented target: the Section 20.2 E2E flows, the Section 20.5 failure/recovery tests, and a load-test run against Section 24's targets all execute against staging before a production promotion is approved, and a staging failure blocks promotion exactly like a CI failure blocks a merge. **Prototype-scope simplification:** with the single-environment path in 21.2, the Section 20.2 E2E flows (the deterministic demo flow) run against the deployed prototype itself before it is presented as demo-ready — this is the prototype's equivalent gate, substituting for a separate staging tier.

### 21.4 Secrets and `.env.example`

No secret (`JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, any future `EMAIL_PROVIDER`/`SMS_PROVIDER` API key) is ever committed — `.gitignore` excludes `.env` from day one (this is a PHASE 0 scaffold requirement, Section 28, not an afterthought). A `.env.example` file at the repo root lists every required variable name with a placeholder/description value, kept in sync with actual usage as a CI check (a variable read via `process.env.X` in source with no corresponding line in `.env.example` fails a lightweight grep-based CI step). Secrets are injected at deploy time via the hosting platform's secret manager (Supabase project settings, or the chosen host's env-var UI), never baked into a built artifact.

### 21.5 Seed Script

`prisma/seed.ts`, invoked via `npx prisma db seed`, populates development, staging, and the deployed prototype environment (Section 19.3 — for this hackathon pass the deployed environment is itself a seeded demo instance, not a mock-data-free production build) with the cooperatives, services, sample workers/customers/bookings, and reviews drawn from `mockData.js` plus at least one seeded `ADMIN` account (`isSuper = true`, demo credentials documented per Section 29.6) so the Postman collection's admin-login step (Section 5.1) and this document's E2E admin flow (Section 20.2) have a real account to authenticate against without a manual promotion step, and demo credentials for at least one seeded `CUSTOMER` and one seeded `WORKER` account for the same reason. The seed script also runs the `IdempotencyKey`/expired-token cleanup job once (Section 3, "expired rows are reaped by a cleanup job") to establish the pattern, though the recurring schedule for that job belongs in the deployed cron/worker process, not the one-shot seed. Section 15.9's `POST /admin/demo/reset` invokes this same script's logic against a live database.

---

## Section 22: Monitoring and Observability

`IMPLEMENTATION REQUIRED` — reduced to prototype scope in the Version 3.0 pass (Section 0.4: health endpoints and structured logs are P1/kept; the Prometheus metrics surface and formal alerting thresholds are P2/simplified, not removed). A hackathon prototype still needs to prove it is not silently broken; it does not need a production-grade observability stack.

### 22.1 Health Endpoints

- `GET /health` — process is up, returns `200` immediately, no dependency checks (used by the process supervisor / container orchestrator's liveness probe).
- `GET /live` — alias of `/health` for orchestrators that distinguish liveness from readiness by path convention; identical behavior.
- `GET /ready` — checks a live Postgres connection (`SELECT 1`) and a live Redis `PING`; returns `200` only if both succeed within a 2-second timeout, `503` otherwise (used as the readiness probe — a `503` here means "don't route traffic to this instance yet/anymore," matching Section 20.5's "database unavailable" expected behavior).

### 22.2 Metrics (P2, simplified for prototype scope)

Full target form: exposed via a `/metrics` endpoint (Prometheus text format) or pushed to the hosting platform's native metrics, covering request rate, p95 latency, error rate, booking success rate, dispatch success/failure counts, wallet/redemption failure rates, DB/Redis health, and Socket.io connection counts, each per Section 24.1's targets — this full metric set is documented here as the future upgrade path and is not required to be built for the hackathon demo. **Prototype-scope minimum:** the hosting platform's built-in request logs/dashboard (whatever the deploy target provides natively — Vercel/Render/Railway-style platform metrics, or equivalent) plus the `/ready` check (22.1) are sufficient to confirm the deployed prototype is up during a demo; a custom `/metrics` endpoint is not required.

### 22.3 Alerting Thresholds (`OUT` for prototype scope, Section 0.4)

Full target form, preserved for the future production upgrade: error rate (5xx) > 2% over 5 minutes; p95 latency > 2× the Section 24.1 target sustained for 5 minutes; `/ready` failing for more than 30 seconds; dispatch reconciliation sweep (Section 11.4) finding stale `OFFERED` rows on more than 3 consecutive sweeps; notification permanent-failure rate (Section 18.2) exceeding 5% of a channel's volume. Not built for this prototype — there is no on-call rotation or paging target for a hackathon demo, so automated alerting has no one to alert.

### 22.4 Structured Logs

Every log line is JSON with, at minimum: `timestamp` (ISO 8601), `level` (`debug|info|warn|error`), `requestId` (Section 8.3), `route`, `status`, `latencyMs`, a safe user identifier where appropriate (the `userId` uuid — never email/phone/name in a log line, per Section 8.6/17.5), and `errorCode` when applicable (matching the Section 4.8 envelope's `code`). Secrets are never exposed, per Section 8.6 — restated here as the operational reminder that a logging library's default request-logger middleware (which often logs full headers/bodies) must be explicitly configured to redact `Authorization`, `Cookie`, and any field named `password`/`token`/`otp`/`secret` before it is wired in, not left at its default.

---

## Section 23: Backup and Disaster Recovery

`OUT` for build scope in the Version 3.0 pass (Section 0.4) — **retained in full below as the documented future production upgrade path**, not deleted, per the instruction to remove only unnecessary overhead rather than the specification itself. Enterprise DR (formal RPO/RTO, quarterly restore drills, 12-month cold-storage retention) is disproportionate to a hackathon prototype that will not hold real user data or run unattended for months.

**Prototype-scope minimum (P1, Section 0.4):** confirm Supabase's default automated daily backup is enabled on the project (it is on by default on Supabase's free/paid tiers alike — no configuration required) and note the project's Supabase dashboard URL in `README.md` (Section 26) as where a restore would be initiated from if ever needed. Nothing else in this section is built for the prototype.

### 23.1 Database Backup (documented future upgrade, not built for prototype)

Daily automated full backups plus continuous WAL archiving, both provided by Supabase's managed Postgres backup feature (point-in-time recovery is a Supabase project setting to enable, not custom infrastructure to build).

### 23.2 Retention (documented future upgrade, not built for prototype)

30 days of point-in-time recovery granularity minimum (Supabase's standard PITR window on paid tiers), plus a monthly full-backup export retained for 12 months in a separate storage location for long-horizon recovery/compliance needs beyond the PITR window.

### 23.3 Point-in-Time Recovery (documented future upgrade, not built for prototype)

Any point within the retention window is restorable to a new database instance (never restored in-place over the live production database) — a Supabase-provided capability; the requirement on a future production system is to document the exact restore procedure and have exercised it at least once (23.4).

### 23.4 Restore Testing (documented future upgrade, not built for prototype)

**A backup is not considered valid until a restore has actually been performed and verified against it.** At minimum quarterly, and always after a major schema migration, a future production owner restores the most recent backup to a scratch environment and runs a smoke check (the app boots against the restored database, `GET /ready` returns 200, a known seeded record is queryable).

### 23.5 RPO / RTO (documented future upgrade, not built for prototype)

Recovery Point Objective: ≤ 5 minutes of data loss for a database-level incident. Recovery Time Objective: ≤ 4 hours to a restored, verified, traffic-serving state for a full database-loss incident. Automated failover/multi-region is out of scope for both Version 2.0 and this prototype pass alike.

### 23.6 Rollback and Migration Recovery (kept, lightweight — P1)

A bad deploy (application code) rolls back via the hosting platform's previous-build redeploy, typically under 5 minutes — this is a one-click/one-command action on any standard hosting target and costs nothing extra to rely on for the prototype. A bad migration follows Section 10's migration-safety rule: additive/backward-compatible migrations are preferred specifically so a code rollback does not require a matching schema rollback.

### 23.7 Incident Procedure (documented future upgrade, not built for prototype)

A future `OPERATIONS.md` would document who is paged, the escalation path, the dashboard to check first, the restore procedure, and a post-incident review requirement. For the prototype, if the deployed demo breaks, the fix is: check the platform's build/runtime logs, redeploy the last known-good commit (23.6), and if data is corrupted, run `POST /admin/demo/reset` (Section 15.9) — this three-step path is the entire prototype "incident procedure" and is documented in `README.md` (Section 26), not a separate operations manual.

---

## Section 24: Performance and Scalability Targets

`IMPLEMENTATION REQUIRED` for the underlying design choices (correct indexes, stateless API, Redis caching) — `P2`/simplified for the formal verification activity (Section 0.4): the latency numbers below remain the design target Claude Code builds toward (a well-indexed query and a stateless API cost nothing extra to get right the first time), but running k6/Artillery load tests to formally verify them, and building multi-instance horizontal scaling, are not required for a hackathon demo serving a handful of judges and users at a time.

### 24.1 Latency Targets (design guide, not load-tested for this pass)

| Path | p95 target |
|---|---|
| Simple authenticated GET (profile, wallet balance, single booking) | < 200ms |
| List endpoints with pagination (Section 3.3 rule 5) | < 400ms |
| `POST /bookings/request` (includes the geospatial insert, Section 4.3) | < 500ms |
| Continuity-scoring query alone (Section 4.4.1, the `$queryRaw` scoring call) | < 300ms at up to ~5,000 eligible workers in the search radius |
| Dispatch offer delivery latency (booking created → first `dispatch:offer` socket event reaching the top candidate) | < 2s |
| Socket round-trip (client emits/receives an authenticated event) | < 150ms server-side processing, excluding network |
| Location update processing (`POST /workers/location-ping` → debounced write → `worker:location` broadcast, when not debounced) | < 300ms |

### 24.2 Database Performance

Connection pooling per Section 10; every index named in Section 3.2 is in place before load testing begins (an index audit is a load-test prerequisite, not a follow-up); `EXPLAIN ANALYZE` is run against the continuity-scoring query and any admin report query (Section 15) that aggregates across the full `Booking`/`CreditTransaction` tables, confirming index usage rather than sequential scans at expected production data volume (modeled at, conservatively, 100k bookings and 10k workers for initial capacity planning).

### 24.3 Caching

Redis caches: service catalog (`services:catalog:{lang}`, Section 1.1.3, TTL until explicit invalidation on admin write), platform stats (`stats:platform`, Section 1.1.1, TTL 300s), platform config (Section 1.3.11, TTL 60s). No other caching layer is required for Version 2.0's scale target; a CDN in front of the frontend static bundle (not the API) is a standard, low-effort addition for the Vue SPA's static assets and is recommended but not treated as a hard requirement of this PRD.

### 24.4 Horizontal Scaling (`OUT` for prototype scope, Section 0.4 — single instance only)

Documented design, not built for this pass: the Express API is stateless (all session state lives in the JWT/Redis/Postgres, never in server-process memory) except for the Section 11.4-flagged in-process dispatch timers, which the reconciliation sweep makes safe to run across multiple instances — so the API is *designed* to scale horizontally behind a load balancer with no sticky-session requirement, and Socket.io's Redis adapter (`@socket.io/redis-adapter`) is the documented requirement the moment a second instance is introduced. For this prototype, a single API instance is deployed and is sufficient for demo-day traffic; the Redis adapter is not wired up, and no load balancer is configured. This remains the concrete first step of a future production scale-out, not a redesign.

---

## Section 25: Accessibility and Web Quality

`IMPLEMENTATION REQUIRED`.

### 25.1 Standards Target

WCAG 2.2 AA across every screen in Section 1's inventory.

### 25.2 Concrete Requirements

Semantic HTML (`<button>` for actions, `<nav>` for navigation, proper heading hierarchy — the existing `index.html` already uses semantic headings extensively per the Section 1 audit, this is a regression check, not new structure); full keyboard navigation (every interactive element reachable and operable via Tab/Enter/Space/Escape, including all admin modals listed in Section 1.3); visible focus states (never `outline: none` without a replacement focus style); ARIA labels on icon-only buttons (the frontend uses Font Awesome icon buttons extensively — e.g. the map zoom/fit controls in Section 1.3.4 — each needs an `aria-label`); screen-reader support for dynamic content (the dispatch matching screen's live status updates, Section 1.1.5, use an `aria-live="polite"` region so a screen-reader user hears "worker assigned" without needing to re-navigate to the status element); reduced motion (the landing page's `triggerStatsAnimation`/scroll-reveal effects and the live map's animated worker movement, Section 1.3.4's `animateMap`, respect `prefers-reduced-motion: reduce` by disabling or shortening the animation, not just visually — this is a new requirement Version 1.0 did not specify).

### 25.3 SEO — Public Pages Only

The landing page (Section 1.1.1, pre-auth) is the only public, indexable page in this system. It requires: a descriptive `<title>`, a `<meta name="description">`, a canonical `<link>` tag, OpenGraph tags (`og:title`, `og:description`, `og:image` using `worksetu_logo.png`), and a favicon (already present as `worksetu_logo.png` in the repo — wired as `<link rel="icon">`). `sitemap.xml` lists only the landing page. `robots.txt` allows the landing page and disallows every authenticated route path (`/dashboard`, `/admin`, etc. — whatever the SPA's client-side routes resolve to, since this is a client-rendered app with no server-rendered per-route HTML to separately protect).

### 25.4 Private Pages Are Never Indexed

Every screen behind `setRole`/login (customer dashboard, worker dashboard, the entire Registrar Console) serves `<meta name="robots" content="noindex, nofollow">` and is additionally disallowed in `robots.txt` — belt-and-suspenders, since a client-side-routed SPA can't rely on `robots.txt` path-blocking alone to keep a crawler from indexing content it renders after JS execution.

---

## Section 26: Documentation Requirements

`IMPLEMENTATION REQUIRED` for the rows marked P0/P1 below; `OUT` rows are documented as a future upgrade, not written for this pass (Section 0.4). Every required file is at the repository root (or `/server` root where noted) before PHASE 15 (Section 28). Each is scoped tightly to avoid duplicating this PRD — every doc cross-references this file rather than restating its content.

| File | Required contents | Scope |
|---|---|---|
| `README.md` | Project overview, tech stack (this PRD's header block), local setup (env vars per `.env.example`, `npm install`, `prisma migrate dev`, `npm run dev`, `npx prisma db seed`), seeded demo credentials (Section 29.6 #3), the deployed prototype URL, and the three-step "if the demo breaks" procedure (Section 23.7) in place of a separate operations manual, plus a link to every other doc below | P0 |
| `ARCHITECTURE.md` | The system diagram this PRD's Sections 1/11/12/13/14 describe in prose — customer/worker/admin flows, dispatch engine, real-time layer, ledger — as a single navigable overview with links into the relevant PRD sections rather than a restatement | P1 |
| `API.md` | Generated or hand-maintained from Section 4.2/4.11's route matrices — every route, its auth guard, and a link to its full contract in this PRD | P1 |
| `DATABASE.md` | The Section 3.2 constraint-audit table plus an ER diagram (generated via `prisma-erd-generator` or drawn by hand) | P2 |
| `SECURITY.md` | Section 6–9's requirements summarized with links back to this PRD, plus the actual retention-period decision named in Section 17.4 | P2 |
| `DEPLOYMENT.md` | Environment promotion (Section 21.2's prototype-scope single-environment path), required env vars (`.env.example`), the connection-pooling configuration (Section 10), and the Supabase project settings to enable (PostGIS extension; PITR is `OUT` per Section 23.1 and not required here) | P1 |
| `OPERATIONS.md` / `DISASTER_RECOVERY.md` | Full enterprise form (Section 22's monitoring/alerting setup, Section 23's restore procedure and quarterly-drill log) — `OUT` for this pass; the prototype's equivalent content is folded into `README.md` above instead of maintained as separate files | `OUT` |
| `TESTING.md` | How to run each test level from Section 20.1 locally and in CI, and where the Section 20.2 E2E specs and Section 5.1 Postman collection live | P1 |
| `CONTRIBUTING.md` | Branch/PR conventions, the CI gate (Section 21.1) a PR must pass, and a pointer to this PRD as the source of truth for any new feature's spec before code is written | P2 |
| `.env.example` | Every environment variable referenced anywhere in this PRD (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `REDIS_URL`, `PORT`, `CORS_ALLOWED_ORIGINS`, future `EMAIL_PROVIDER`/`SMS_PROVIDER`/`PUSH_PROVIDER` keys per Section 18.4), each with a placeholder value and a one-line comment, kept current per Section 21.4's sync rule | P0 |

---

## Section 27: Claude Code Implementation Rules (Worked Examples)

`SPECIFICATION COMPLETE`. This section demonstrates the WHAT/WHERE/WHY/INPUT/OUTPUT/DATABASE/SECURITY/ERRORS/TESTS pattern against six representative features spanning the areas most likely to be implemented ambiguously if left as prose alone. Every other requirement in this document is written with the same level of concreteness inline (a route's method+path+auth+request+response+validation+db-effect+errors, a schema field's type+nullability+index, a threat's vector+mitigation+test) — this section is a template, not the only place the standard applies.

**Feature: JWT access-token verification middleware**
- WHAT: Express middleware that authenticates a request before its route handler runs.
- WHERE: `src/middleware/auth.ts`, applied per-route via `requireAuth(...roles)` (Section 4.1), never globally mounted (Section 7.2 — every route states its guard explicitly).
- WHY: Section 6.1/7.2 — deny-by-default, and every downstream authorization/IDOR check (Section 7.3) depends on a trustworthy `req.user`.
- INPUT: `Authorization: Bearer <token>` header.
- OUTPUT: `req.user = { id, role }` attached on success; on failure, a `401` response in the Section 4.8 envelope, request pipeline halted.
- DATABASE: one read — `User.tokenVersion` and `User.accountStatus` looked up by `payload.sub` to check revocation (Section 6.3/6.4) and suspension; a `SUSPENDED` or `deletedAt IS NOT NULL` user is rejected even with a structurally valid, unexpired, unrevoked token.
- SECURITY: explicit `algorithms: ["HS256"]` allowlist (Section 9 threat #9); no role/id ever trusted from anywhere except the verified payload.
- ERRORS: `401 MISSING_TOKEN`, `401 INVALID_TOKEN` (bad signature/malformed), `401 TOKEN_EXPIRED`, `401 TOKEN_REVOKED` (tokenVersion mismatch), `403 ACCOUNT_SUSPENDED`.
- TESTS: missing header, malformed token, expired token, token signed with wrong secret, token with `alg: none`, valid token for a since-suspended account, valid token for a since-tokenVersion-bumped account, fully valid token (happy path) — matches Section 9 threat #9's verification list exactly.

**Feature: Booking creation with idempotency**
- WHAT: `POST /bookings/request` (Section 4.3).
- WHERE: `src/controllers/booking.controller.ts`.
- WHY: Section 1.1.4 (core customer action), Section 4.9 (idempotency-critical route), Section 11.3.
- INPUT: Section 4.3's `requestBookingSchema` shape, plus optional `Idempotency-Key` header.
- OUTPUT: `{ bookingId, status: "REQUESTED", estimatedTotal }`, `201`.
- DATABASE: single `$transaction` — `Booking` insert (server-computed `estimatedTotal` from `ServiceCategory`, never client-supplied, Section 3.3 rule 3) + `AuditLog` insert; if an `Idempotency-Key` was supplied, an `IdempotencyKey` row records the response (Section 4.9) inside the same transaction.
- SECURITY: `customerProfile` resolved from `req.user.id`, never a body field (Section 7.3); India-bounding-box lat/lng validation (already in Section 4.3) narrows abuse surface.
- ERRORS: `400 VALIDATION_FAILED`, `404 SERVICE_NOT_FOUND`, `404 CUSTOMER_PROFILE_NOT_FOUND`, `409 IDEMPOTENCY_KEY_REUSE` (Section 4.9).
- TESTS: valid request happy path; each validation rule's boundary (description length, lat/lng bounds, disabled service); repeated `Idempotency-Key` with identical body returns identical response without a second row; repeated key with different body returns 409.

**Feature: Dispatch acceptance (double-assignment prevention)**
- WHAT: `POST /dispatch/:dispatchLogId/respond` with `response: "ACCEPT"` (Section 4.4.4).
- WHERE: `src/controllers/dispatch.controller.ts`.
- WHY: Section 9 threat #11, Section 11.2 — the highest-consequence race condition in the system.
- INPUT: path `dispatchLogId`, body `{ response: "ACCEPT" }`.
- OUTPUT: `{ outcome: "ACCEPTED" }` or `409 { outcome: "LOCK_LOST" | "ALREADY_ASSIGNED" }`.
- DATABASE: `$transaction` re-checking `booking.assignedWorkerId IS NULL` before writing (Section 4.4.4), guarded by the Redis lock acquired first.
- SECURITY: Redis `SET NX PX` atomic lock (Section 4.4.2); ownership check `dispatchLog.workerId === req.user`'s worker profile (Section 7.3, already in Section 4.4.4); `Idempotency-Key` optional layer (Section 4.9).
- ERRORS: `404 DISPATCH_LOG_NOT_FOUND`, `409 OFFER_NO_LONGER_ACTIVE`, `409 LOCK_LOST`, `409 ALREADY_ASSIGNED`.
- TESTS: two concurrent accept requests for the same booking from two different offered workers — exactly one 200, one 409 (Section 20.5); accept after the offer already timed out; accept by a worker who was never offered this dispatch log (expect 403/404 per Section 7.3, since `workerId` mismatch on a resource that does belong to the system but not this actor).

**Feature: Wallet redemption (balance-safety)**
- WHAT: `POST /workers/me/wallet/redeem` (Section 4.7).
- WHERE: `src/controllers/wallet.controller.ts`.
- WHY: Section 9 threat #13, Section 13.3/13.4.
- INPUT: Section 4.7's `redeemSchema`, plus optional `Idempotency-Key`.
- OUTPUT: `{ transactionId, status: "PROCESSING" }`, `200`; or `409 INSUFFICIENT_BALANCE`.
- DATABASE: `$transaction` with `SELECT ... FOR UPDATE` row lock on the worker's ledger rows before computing balance and inserting the `REDEMPTION` row (Section 4.7, 13.3).
- SECURITY: `workerProfileId` resolved from `req.user.id` only (Section 13.4); balance derived, never trusted from client (Section 3.3 rule 3).
- ERRORS: `400 VALIDATION_FAILED`, `409 INSUFFICIENT_BALANCE`, `409 IDEMPOTENCY_KEY_REUSE`.
- TESTS: redeem exactly the full balance (succeeds); redeem balance+1 (fails); two concurrent redemptions summing to more than balance but each individually affordable (Section 20.5 — exactly one succeeds).

**Feature: Worker document upload**
- WHAT: `POST /workers/documents` (Section 16).
- WHERE: `src/controllers/document.controller.ts`.
- WHY: Section 16, Section 9 threat #8.
- INPUT: `multipart/form-data`, one file, `documentType` field.
- OUTPUT: `{ documentId, scanStatus: "PENDING" }`, `202` (accepted, scan pending — not yet usable for verification).
- DATABASE: `Document` row insert with server-generated `storageKey` (Section 16.3), `scanStatus = PENDING`.
- SECURITY: extension+content-sniffed MIME allowlist (Section 16.2/16.7), 10MB size cap, random storage key (Section 16.3), private bucket (Section 16.4), async malware scan gate before any consumer can treat the document as valid (Section 16.6).
- ERRORS: `400 INVALID_FILE_TYPE`, `400 FILE_TOO_LARGE`, `400 MIME_MISMATCH` (content-sniff disagrees with declared type).
- TESTS: valid PDF/JPEG/PNG upload; oversized file; disallowed MIME; a `.exe` renamed to `.pdf` (content-sniff catches it, Section 9 threat #8's test); confirm the document is not returned by the signed-url endpoint until `scanStatus = CLEAN`.

**Feature: Socket.io authenticated connection and room join**
- WHAT: The `io.use(...)` handshake middleware and automatic room-join logic (Section 12.2/12.3).
- WHERE: `src/lib/socket.ts`.
- WHY: Section 9 threat #17.
- INPUT: `auth.token` in the Socket.io client connection payload.
- OUTPUT: connection accepted and joined to the caller's authorized rooms, or connection rejected at handshake.
- DATABASE: same `User` lookup as the HTTP JWT middleware (tokenVersion/accountStatus check); a query for the connecting user's current non-terminal bookings/worker-profile id to compute which rooms to join.
- SECURITY: same JWT verification as Section 4.1's HTTP middleware, reused rather than reimplemented; no client-emitted "join room" event exists (Section 12.3).
- ERRORS: connection rejected (no HTTP status code applies; Socket.io's connection-error event carries an equivalent `code`).
- TESTS: no token → rejected; invalid token → rejected; valid worker token → joined only to their own `worker:{id}` room and their own active bookings' rooms, verified by attempting to observe another worker's room and confirming no events arrive.

---

## Section 28: Final Implementation Order

`SPECIFICATION COMPLETE`. Restructured in the Version 3.0 hackathon pass from Version 2.0's flat 36-step list into 16 dependency-ordered phases, PHASE 0 through PHASE 15. Each phase has a Goal, its Required work (mapped to the existing PRD sections that specify it — no work here duplicates a specification, it only sequences it), a Verification step, and a mandatory Git commit. **Claude Code does not start PHASE N until PHASE N-1's Verification step passes, and every phase ends in exactly one commit before the next phase begins** — see Section 28.16 (Git Safety) for the rules governing that commit.

### PHASE 0 — Repository Audit and Scaffold

- **Goal:** confirm the starting state matches this PRD and stand up the backend project skeleton.
- **Required work:** confirm `index.html`, `app.js`, `mockData.js`, `translations.js`, `worksetu_logo.png` are present and match Section 1/2's description, noting any drift before writing code; create `/server` folder structure, `package.json`, `tsconfig.json`, `.gitignore` (excluding `.env` from the first commit), `.env.example` skeleton (Section 21.4).
- **Verification:** `npm install` succeeds in `/server`; `tsc --noEmit` runs clean on the empty scaffold; `.env` is confirmed absent from `git status`.
- **Git commit:** `git add . && git commit -m "phase-0: repository audit and backend scaffold"`.

### PHASE 1 — Database Schema and Migrations

- **Goal:** the full data model exists and is migrated.
- **Required work:** `schema.prisma` from Section 3 in full, including every model/field added in Version 2.0 and 3.0 (RefreshToken, PasswordResetToken, OtpVerification, IdempotencyKey, SettlementRecord, Document, plus the new fields on User/WorkerProfile/UserPreference/Booking/PaymentTransaction/CreditTransaction); `prisma migrate dev --name init`; the Section 3.1 spatial-index SQL.
- **Verification:** `prisma validate` and `prisma format --check` clean; migration applies to a fresh database with no errors.
- **Git commit:** `git add . && git commit -m "phase-1: database schema and initial migration"`.

### PHASE 2 — Seed Data and Demo Dataset

- **Goal:** the database is populated with realistic, resettable demo data — mock/seed data is a deliverable, not a removal target (Section 1.4, 19.3).
- **Required work:** `prisma/seed.ts` drawing on `mockData.js` per Section 19.3, covering customers/workers/admins/services/bookings across lifecycle stages/skills/locations/reviews/notifications/wallet history/incentives; seeded demo credentials for at least one CUSTOMER, one WORKER, one super-ADMIN account.
- **Verification:** `npx prisma db seed` runs clean and populates every model listed in 19.3; demo credentials documented (Section 29.6).
- **Git commit:** `git add . && git commit -m "phase-2: seed script and demo dataset"`.

### PHASE 3 — Authentication and RBAC

- **Goal:** every role can register, log in, and is denied access outside its own permissions.
- **Required work:** Section 6 in full (register/login, refresh rotation, logout/logout-all, password reset, OTP verification, brute-force lockout); Section 7 in full (`requireAuth`/role guards on every route stub, Section 7.3's ownership-check/IDOR pattern).
- **Verification:** the Section 20.2 auth steps of all three flows pass against a running server; a wrong-role request against a role-gated route returns `403`/`404` per Section 7's pattern, never `200`.
- **Git commit:** `git add . && git commit -m "phase-3: authentication and RBAC"`.

### PHASE 4 — Validation, Error Handling, and API Security Framework

- **Goal:** every route is validated, errors are uniform, and baseline API abuse protections are live.
- **Required work:** Section 8 in full (Zod on every route, Section 4.8 error envelope, request-id middleware, CORS, security headers, rate limiting Section 4.10, idempotency-key middleware Section 4.9).
- **Verification:** an intentionally malformed request to any route returns the Section 4.8 envelope, never a raw stack trace; a duplicate `Idempotency-Key` request returns the original stored response.
- **Git commit:** `git add . && git commit -m "phase-4: validation, error envelope, and API security middleware"`.

### PHASE 5 — Customer and Worker Core APIs

- **Goal:** every non-dispatch, non-payment customer and worker route from Section 4.2/4.11 is live.
- **Required work:** every `Public`/`JWT Customer` route; every `JWT Provider` route.
- **Verification:** each route in scope returns the documented shape for a valid seeded request (Postman/newman, Section 5.1).
- **Git commit:** `git add . && git commit -m "phase-5: customer and worker core APIs"`.

### PHASE 6 — Booking State Machine and Continuity Dispatch Engine

- **Goal:** a submitted booking reaches `ASSIGNED` through the real engine, not a placeholder.
- **Required work:** Section 4.4.5's transitions (corrected per Section 4.12 item 1), Section 11.1's full legal-transition table; Section 4.4.1–4.4.4's dispatch engine (corrected per Section 4.12 item 2), Section 11.4's reconciliation sweep.
- **Verification:** a seeded booking request reaches `ASSIGNED` via top-3/pool dispatch against seeded workers, not a hardcoded assignment (Section 0.4 P0 acceptance criterion).
- **Git commit:** `git add . && git commit -m "phase-6: booking state machine and dispatch engine"`.

### PHASE 7 — Redis and Socket.io Real-Time Layer

- **Goal:** dispatch and location updates reach the client live.
- **Required work:** Redis lock helper (Section 4.4.2), rate-limiter store (4.10), cache layer (24.3); Socket.io auth/room logic (12.2/12.3), `dispatch:update`/`worker:location`/`notification:new` events. The Section 24.4 Redis adapter is `OUT` for this pass (single instance) and is not wired up here.
- **Verification:** the Section 20.5 concurrent-accept test produces exactly one `200`/one `409`; a connected client receives `dispatch:update` without polling.
- **Git commit:** `git add . && git commit -m "phase-7: redis locking and socket.io real-time layer"`.

### PHASE 8 — Location Services

- **Goal:** worker location updates flow safely into dispatch scoring and customer tracking.
- **Required work:** Section 12.1/12.4/12.6 — the debounced ping endpoint, plausibility check.
- **Verification:** a location ping updates `worker:location` broadcast and is reflected in the next continuity-scoring query.
- **Git commit:** `git add . && git commit -m "phase-8: location services"`.

### PHASE 9 — Invoicing, Ledger, and Payment (including Gateway "Coming Soon")

- **Goal:** completion produces an invoice, the internal wallet reflects real ledger math, and the payment category is visible with an honest, non-broken "Coming Soon" state.
- **Required work:** Section 4.5's completion controller with server-computed fee (Section 3.3 rule 3); Section 13 in full (ledger, `REFUND`/`REVERSAL` types, idempotency); Section 4.7 plus Section 14's manual settlement/reconciliation endpoints; Section 14.7's `ManualRecordAdapter`/`UnavailableGatewayAdapter` and the "Payment Gateway Not Configured" UI state.
- **Verification:** a completed booking produces an `Invoice` and a `JOB_PAYOUT` `CreditTransaction` whose sum matches `GET /workers/me/wallet`; selecting the online-payment option returns `501 PAYMENT_GATEWAY_NOT_CONFIGURED` and renders the exact Section 14.7 UI copy, never a silent failure or fake success.
- **Git commit:** `git add . && git commit -m "phase-9: invoicing, wallet ledger, and payment gateway coming-soon state"`.

### PHASE 10 — Reviews, Feedback Credit, and Notifications

- **Goal:** the review→credit loop and in-app notifications work end to end.
- **Required work:** Section 4.5's review controller (corrected per 4.12 item 1) plus Section 4.6's Feedback Credit engine; Section 18's channel abstraction with `InAppChannel` fully wired, other channels stubbed per Section 0.4 (`OUT`).
- **Verification:** a ≥4.5-star review produces a `FEEDBACK_CREDIT` row; a booking-assigned and a booking-completed event each produce an in-app notification.
- **Git commit:** `git add . && git commit -m "phase-10: reviews, feedback credit, and in-app notifications"`.

### PHASE 11 — Admin Console

- **Goal:** every admin workflow named in Section 15 is live, including the new prototype-only demo reset.
- **Required work:** Section 15 in full (suspend/reactivate, cancel, wallet adjustment, credit-transaction reversal, audit-log viewer) plus Section 15.9's `POST /admin/demo/reset`; Section 16's document/KYC storage and stub malware-scan boundary.
- **Verification:** every action in Section 15.1's table writes an `AuditLog` row (checked via Section 15.8's viewer); `POST /admin/demo/reset` restores the seed dataset on demand.
- **Git commit:** `git add . && git commit -m "phase-11: admin console and demo data reset"`.

### PHASE 12 — Frontend Integration and i18n

- **Goal:** `app.js` calls the real backend end to end, in all four languages.
- **Required work:** every `fetch`/API call in `app.js` mapped to a Section 4.2/4.11 route (19.4); Section 1.4/19.1's screen-state matrix; Section 2.3's i18n requirements with the Section 2.2 dictionary (including the new `paymentGatewayNotConfigured`/`paymentGatewayComingSoonBody`/`paymentGatewayFallbackCta` keys, Section 14.7) wired for EN/HI/TA/BN, zero hardcoded strings, zero trailing periods; Section 19.6's XSS-safe rendering audit; Section 19.2's simulation-string grep (not a mock-data grep — mock data itself is kept).
- **Verification:** a grep for hardcoded UI strings and for the three banned simulation function names both return zero matches; switching the language selector changes every screen's text including the new payment-gateway copy.
- **Git commit:** `git add . && git commit -m "phase-12: frontend integration and i18n"`.

### PHASE 13 — Testing

- **Goal:** the system is verified, not just built.
- **Required work:** Section 20.1's unit and integration tests; Section 20.2's three E2E flows (Playwright and newman); Section 20.4's security test matrix against Section 9's 17 threats; Section 20.5's failure/recovery tests. Section 24's load testing stays `OUT` (Section 0.4) — not run for this pass.
- **Verification:** all three Section 20.2 flows pass in both forms; all 17 Section 9 threats have a passing test.
- **Git commit:** `git add . && git commit -m "phase-13: unit, integration, e2e, and security tests"`.

### PHASE 14 — CI/CD and Deployment

- **Goal:** the prototype is built, tested automatically, and reachable at a public URL.
- **Required work:** Section 21.1's pipeline stages wired in CI; Section 21.2's prototype-scope single-environment deployment; Section 22.1's health endpoints live on the deployed instance; environment variables/CORS configured for the deployed URL per `.env.example` (21.4).
- **Verification:** a push to `main` runs the full pipeline green; `GET /health` and `GET /ready` both return `200` against the public deployment; the deployed frontend successfully calls the deployed backend (no CORS errors).
- **Git commit:** `git add . && git commit -m "phase-14: ci/cd pipeline and public deployment"`.

### PHASE 15 — Documentation and Final Audit

- **Goal:** the repository is demo-ready and self-explaining, and every requirement in this PRD has a known status.
- **Required work:** Section 26's documentation set (`README.md` with setup/deploy/demo-credentials instructions, replacing the full `OPERATIONS.md`/`DISASTER_RECOVERY.md` per Section 23's prototype-scope note); Section 25's accessibility baseline; Section 29's consistency audit re-run against the finished repository, not just the PRD; Section 29.6's 27-item acceptance checklist run end to end.
- **Verification:** every item in Section 29.6 is checked `PASS` or explicitly logged as a known gap with a reason; the Section 20.2 demo flow is run once, live, on the deployed prototype URL, start to finish, without a manual database fix mid-run.
- **Git commit:** `git add . && git commit -m "phase-15: documentation and final acceptance audit"`.

### 28.16 Git Safety and Future-Correction Rules

`SPECIFICATION COMPLETE`. Applies across all sixteen phases above:

- One commit per phase, made only after that phase's Verification step passes — never a single giant final commit covering multiple phases.
- Commit messages follow the `phase-N: <short description>` convention shown in each phase above — descriptive, not `wip`/`fix`/`update`.
- A phase is never committed in a known-broken state; if Verification fails, the fix happens before the commit, not after.
- Prior phase commits are never rewritten, squashed, or force-pushed over — history stays linear, PHASE 0 through PHASE 15, so any phase can be inspected or reverted to independently later.
- If a defect in an earlier phase is found while working on a later phase, the fix is made and committed as its own new commit at the current point in history (e.g. `fix: correct phase-6 dispatch radius bound found during phase-9 testing`), never by amending the original phase's commit.

---

## Section 29: Final Consistency Audit Log

`SPECIFICATION COMPLETE`. This is the record of every contradiction, duplication, and gap this hardening pass found and fixed — in the PRD itself (a document-authoring defect) and in the Version 1.0 system design (a specification defect) — kept here so future edits to this document don't reintroduce the same class of error.

### 29.1 Document-Authoring Defects (found and fixed while assembling this version)

| # | Defect | Fix |
|---|---|---|
| 1 | The Section 3→4 transition edit produced a duplicated `## Section 4: Detailed API Contract Matrix and Engine Algorithms` heading with an empty section in between | Removed the duplicate heading; single Section 4 heading confirmed by a full-file grep of every `## Section N` line against the table of contents (Section 0 sequential check: 0 through 28, each exactly once) |
| 2 | The Section 4.2 route-matrix addition for the new auth/wallet/document endpoints included a redundant self-referential row for `POST /api/v1/auth/refresh` ("listed above") duplicating the row already present higher in the same table | Removed the redundant row; the original row's auth-guard label was corrected from "Public (refresh token)" to "Public (httpOnly refresh cookie, Section 6.1)" to match the Section 6.1 cookie-based design this pass introduced |
| 3 | New models/fields introduced in Sections 13–18 (`Document`, `SettlementRecord`, `User.acceptedTermsAt`, `WorkerProfile.suspendedAt`, `UserPreference.notificationChannels`, `Certification.documentId`) were specified in prose before being added to the actual `schema.prisma` block and the Section 3.2 constraint-audit table | All six were added to the schema in Section 3 (with back-relations verified — every `@relation(fields: ...)` has a matching collection/optional field on the referenced model, checked programmatically) and the Section 3.2 table rows for `User`, `WorkerProfile`, `Certification` were updated; a new `Document` row was added |
| 4 | Four new admin endpoints introduced in Section 14 (settle redemption, refund, reconciliation report, reconcile settlement) and four more introduced in Section 15 (suspend worker, admin cancel, wallet adjustment, credit-transaction reversal) plus the Section 6/16/17 auth/document endpoints existed only in prose within their own sections, not in the Section 4.2 master route table | All were added to Section 4.2 so it remains the single master list every other section's endpoint references resolve against |

Verification performed: full-document grep confirmed zero duplicate `## Section` headings, zero duplicate Prisma model or enum names (27 models / 20 enums, all unique), balanced braces/parens in the schema block (50/50, 267/267), all four Prisma named relations (`AuditActor`, `CustomerBookings`, `AssignedWorker`, `WorkerReviews`) paired exactly twice each, the Postman collection (Section 5.1) still parses as valid JSON (15 requests), the translations object (Section 2.2) still contains zero trailing-period values in any of the four locales, and zero references to Razorpay/Stripe/PayPal/UPI-gateway/card-gateway exist outside the two explicit exclusion statements (document header and Section 14 opening paragraph).

### 29.2 Specification Defects Found in the Version 1.0 System Design

These are the two items already detailed in full in Section 4.12 — listed here again only as the audit-trail entry, not repeated in full:

1. `transitionBookingStatus` could not actually be called from inside `submitReview`'s transaction as originally shown, meaning the `COMPLETED -> SETTLED` transition silently bypassed the legal-transition guard. Corrected by specifying an injectable Prisma client parameter (Section 4.12 item 1, reflected in Section 11.1's transition table).
2. The continuity-dispatch scoring query ignored each worker's individually configured `serviceAreaRadiusKm` in favor of one global constant, contradicting the schema field's stated purpose. Corrected by specifying a `LEAST(worker's own radius, platform ceiling)` bound (Section 4.12 item 2, reflected in Section 11.5's dispatch checklist).

### 29.3 Gaps Closed by Addition (no contradiction existed, capability was simply absent)

Authentication session lifecycle (Section 6), RBAC ownership pattern and privilege-escalation rules (Section 7), the API security framework and standardized error envelope (Section 8, 4.8), the 17-item threat model (Section 9), database connection-pooling/migration-safety/referential-integrity rules (Section 10, 3.3, 3.4), dispatch failure-recovery durability (Section 11.4 — the one item classified `NON-PRODUCTION` in Section 0.2), Socket.io auth/room/reconnect/GPS-plausibility rules (Section 12), ledger immutability and transaction-type completeness including `REFUND`/`REVERSAL` (Section 13), the full manual-settlement money-flow chain and reconciliation workflow (Section 14), the worker-suspension and audit-log-viewer admin endpoints that Section 1.3 implied but never specified (Section 15), document/KYC storage security in full (Section 16, previously just "identity upload" with no contract), privacy/retention/deletion rules (Section 17), the notification channel abstraction (Section 18), the frontend screen-state matrix and mock-data-removal gate (Section 1.4, 19), and Sections 20–28 in their entirety (testing, CI/CD, monitoring, backup/DR, performance targets, accessibility/SEO, documentation, worked implementation examples, and the final build order) — all fourteen items the Section 0.2 summary table counted as "Missing."

### 29.4 Known Remaining Simplifications (Intentional, Not Defects)

Recorded here so they are never mistaken for oversights: the malware scanner (Section 16.6) is a stub interface, not a real AV engine, by explicit design; email/SMS/push notification channels (Section 18) are interface-ready stubs, not wired to a real provider, by explicit instruction not to force one; automated fraud/collusion pattern-detection across bookings (Section 9 threat #15) is manual-admin-driven, not an ML/analytics system; multi-region failover (Section 23.5) is out of scope, RTO is met via single-region restore; GPS spoofing mitigation (Section 12.6, Section 9 threat #14) is a plausibility heuristic, not hardware-backed location attestation.

### 29.5 Version 3.0 Hackathon Pivot — Audit Log

`SPECIFICATION COMPLETE`. This pass re-scoped the document from production-commercial to Smart India Hackathon prototype (~75% functional) framing, per the same in-place, minimum-diff editing discipline established in Section 29.1–29.4. Nothing was deleted wholesale; every reduced-scope section keeps its full original requirement documented as a future upgrade path (Section 0.1's scope note states this as the general rule).

| # | Change | Where |
|---|---|---|
| 1 | Added the P0/P1/P2/OUT functional priority classification, absent in Version 2.0 | New Section 0.4 |
| 2 | Reversed the mock-data-removal rule into a mock/seed-data-retention rule, including in the deployed prototype environment itself, plus a resettable demo dataset | Section 1.4, 19.2, 19.3, 21.5 |
| 3 | Added the admin-only demo data reset endpoint, absent in Version 2.0 | Section 15.1 table, new Section 15.9 |
| 4 | Added the payment gateway "Coming Soon" UI-state contract and the `PaymentService` adapter boundary (`ManualRecordAdapter`/`UnavailableGatewayAdapter` built, `FutureGatewayAdapter` documented only), absent in Version 2.0 | New Section 14.7 |
| 5 | Added the three new i18n keys (`paymentGatewayNotConfigured`, `paymentGatewayComingSoonBody`, `paymentGatewayFallbackCta`) to all four locales, zero trailing periods, consistent with the existing dictionary | Section 2.2 (EN/HI/TA/BN blocks) |
| 6 | Simplified environment promotion to a single-environment deployment path as an accepted prototype-scope alternative, full staging ceremony retained as documented target | Section 21.2, 21.3 |
| 7 | Reduced Monitoring to health checks + platform-native logs; alerting thresholds marked `OUT` and documented as future upgrade | Section 22.2, 22.3 |
| 8 | Reduced Backup/DR to "confirm Supabase default backup is on" + rollback-via-redeploy; formal RPO/RTO, PITR retention, and quarterly restore drills marked `OUT` and documented as future upgrade | Section 23 (23.1–23.5, 23.7) |
| 9 | Reduced Performance/Scalability to a design-target latency table without formal load testing; horizontal scaling/Redis adapter marked `OUT` and documented as future upgrade | Section 24.1, 24.4 |
| 10 | Restructured the flat 36-step Section 28 build order into 16 Git-commit-gated phases (PHASE 0–15), each phase's work still traceable to the same PRD sections the old step numbers referenced | Section 28 |
| 11 | Added the 27-item acceptance criteria checklist | New Section 29.6 |
| 12 | Reframed Section 0.1's `PRODUCTION VERIFICATION REQUIRED` tag as "demo-verified" for this pass's purposes, without changing the tag's name or the three-state legend structure | Section 0.1 |

Verification performed for this pass: confirmed the string `mockData` no longer appears inside any CI-gate grep pattern (Section 19.2) while the three simulation-function names still do; confirmed Section 15's admin action table and Section 4.2/4.11's endpoint list both reflect the new `POST /admin/demo/reset` endpoint consistently; confirmed the new i18n keys appear exactly once per locale block with no trailing periods; confirmed Section 28's sixteen phases collectively reference every PRD section the old 36-step list referenced (no requirement lost in the restructuring); confirmed no remaining reference in Sections 1, 19, or 21 instructs removing or hiding mock/seed data.

### 29.6 Acceptance Criteria Checklist (Version 3.0, Hackathon Prototype)

`SPECIFICATION COMPLETE`. The 27-item bar for "this prototype is demo-ready," checked once live against the deployed instance as PHASE 15's Verification step (Section 28). Each item is marked `PASS` or logged as a known gap with a reason before the system is presented as done.

| # | Criterion | Verified by |
|---|---|---|
| 1 | Customer, Worker, and Admin can each register/log in | Section 6, 20.2 |
| 2 | RBAC correctly restricts each role to its own routes | Section 7, 20.2 |
| 3 | Mock/seed data is present and realistic (not deleted, not placeholder text) | Section 1.4, 19.3 |
| 4 | Database is connected and reachable (`GET /ready` returns `200`) | Section 22.1 |
| 5 | Core APIs (auth, booking, dispatch, wallet, admin) respond correctly | Section 4.2, 4.11 |
| 6 | API tests pass (Postman/newman collection, Section 5.1) | Section 20.1, 21.1 |
| 7 | Customer can select a service/category | Section 1.1.3, 4.2 |
| 8 | A submitted booking persists to the database | Section 4.3 |
| 9 | Booking lifecycle transitions follow the state machine (Section 1.0) | Section 11.1 |
| 10 | A booking is actually assigned to a worker via the dispatch engine | Section 4.4, 11 |
| 11 | Worker can accept, start, and complete a booking | Section 1.2, 4.5 |
| 12 | Customer sees booking status changes live (no manual refresh) | Section 1.1.5, 12 |
| 13 | Admin workflows (verify, force-assign, cancel, audit-log view) work | Section 15 |
| 14 | In-app notifications fire for key events | Section 18 |
| 15 | Reviews can be submitted and are reflected on the worker profile | Section 4.5 |
| 16 | Wallet balance and incentive/Feedback Credit rows are demoable end to end | Section 13, 4.6 |
| 17 | Payment option/category is visible in the UI | Section 14.7 |
| 18 | Payment gateway is confirmed NOT connected to any real processor | Section 14, 14.7 |
| 19 | Clicking the payment gateway option shows the exact "Coming Soon" state, never a silent failure | Section 14.7 |
| 20 | The future-gateway architecture (`PaymentService` adapter boundary) is documented | Section 14.7 |
| 21 | The main demo flow (Section 20.2, all three roles) is repeatable start to finish | Section 20.2, 15.9 |
| 22 | UI is responsive down to a 360px viewport | Section 1.4, 19.5 |
| 23 | No critical runtime errors appear in the browser console during the demo flow | Section 19.6, 20.2 |
| 24 | The production build succeeds (`tsc` backend compile, frontend bundle build) | Section 21.1 |
| 25 | Deployment configuration (env vars, CORS, secrets) works against the deployed target | Section 21.4, 21.2 |
| 26 | The prototype is deployed and publicly reachable at a demo URL | Section 21.2, PHASE 14 |
| 27 | Every phase (PHASE 0–15) has its own dedicated Git commit, in order, none broken | Section 28.16 |

---

