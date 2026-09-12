# Worksetu — Non-Negotiable Build Rules

This project is built from `system-blueprint.md` (Worksetu Production Blueprint
v3.0 — Cooperative Gig-Service Platform, Smart India Hackathon prototype).
That file is the single source of truth. It is large (~5,000 lines); this
file exists so the following rules survive context compaction during a long
build and are never silently violated in a later phase.

## 1. Mock/seed data is a required deliverable — never strip it

Per Section 1.4 / 19.2 / 19.3: this is a **REAL DATABASE + REAL CORE APIs +
REAL CORE BUSINESS LOGIC + MOCK/SEED DATA** system, not a frontend-only fake
demo and not a mock-data-free production build.

- `mockData.js` stays in the repo permanently — it is the input to
  `prisma/seed.ts`, not dead weight to delete.
- Never hide, thin out, or "clean up" seeded rows in the database.
- The only thing Section 19.2 requires removed from the shipped frontend
  bundle is the client-side *simulation timer logic* —
  `simulateWorkerAcceptancePathA`, `simulateNoResponsePathB`,
  `simulatePoolWorkerAcceptance` — because real dispatch (Section 4.4/11)
  replaces the fake client-side timer. The string `mockData` itself is
  explicitly excluded from that removal grep (Section 19.2) — do not treat
  it as a violation.
- `POST /api/v1/admin/demo/reset` (Section 15.9) must always be able to
  restore the seed dataset. If a phase's work would make the seed script
  stale or incomplete, fix the seed script in that same phase.

## 2. Zero payment gateway integration

No Razorpay, Stripe, PayPal, UPI gateway, card gateway, bank API, or any
other external payment processor — anywhere, in any phase, in any file.
This is restated at the top of the PRD and again in Section 14.

- The only two real payment paths are `ManualRecordAdapter` (`CASH` /
  `DIRECT_PAY`, records a payment that already happened outside the app)
  and `UnavailableGatewayAdapter` (`GATEWAY` selection → immediate
  `501 PAYMENT_GATEWAY_NOT_CONFIGURED`, no external call, no
  `PaymentTransaction` row written).
- `FutureGatewayAdapter` (Section 14.7) is a documented interface only —
  method signatures, no implementation, no SDK dependency, no API keys,
  ever.
- The payment category/UI is never hidden — it must be visible, clickable,
  and resolve to the exact Section 14.7 "Payment Gateway Not Configured"
  copy (`paymentGatewayNotConfigured` / `paymentGatewayComingSoonBody` /
  `paymentGatewayFallbackCta` translation keys), never a silent no-op and
  never a fake success.
- Before PHASE 15 sign-off, grep the full repo (backend + frontend) for
  `razorpay`/`stripe`/`paypal` (case-insensitive) and confirm zero matches
  outside this file and the PRD itself.

## 3. Every route: Section 4.8 error envelope + Section 7.3 404-not-403 IDOR pattern

**Error envelope (Section 4.8)** — every non-2xx response, from every
route, uses:

```json
{ "error": { "code": "ERROR_CODE", "message": "Safe message", "requestId": "..." } }
```

No stack traces, no raw SQL/Prisma errors, no file paths, no secrets in
`message` (Section 8.5). Status codes are standardized: `400` validation,
`401` auth, `403` wrong role, `404` not found / not visible to requester,
`409` state conflict, `422` semantically invalid, `429` rate-limited, `500`
generic (`"An unexpected error occurred"`, real error logged server-side
with `requestId` only).

**IDOR/BOLA pattern (Section 7.3)** — every resource-scoped `:id` endpoint:

1. Resolve identity from `req.user.id` only — never from body/path.
2. Load the target resource by its path id.
3. Compare an ownership field on the loaded resource against that identity.
4. Mismatch + non-`ADMIN` role → **`404`, not `403`**. A `403` confirms the
   resource exists but belongs to someone else; `404` reveals nothing.
   The only exception: pure role-gated routes with no per-resource
   ownership concept (`admin/*`) correctly return `403` for a wrong-role
   caller, since there's no resource-existence fact to protect.

This pattern is retroactive: any `:id` route in Section 4.2 not already
shown with an explicit ownership check in Sections 1/4/4.11 needs one added
before it ships — never assume "read-only, so no check needed."

## 4. Every `app.js` fetch call maps to exactly one Section 4.2 route

Section 1.4 / 19.4: the Section 4.2 route matrix (extended by Section
4.11's hardening columns) is the master, closed list of backend endpoints.

- If a frontend call is needed and the matching route is not in Section
  4.2 — **stop and flag it to the user**. Do not invent an undocumented
  endpoint to make the frontend "just work."
- Before PHASE 12 is considered done: every `fetch`/axios call in `app.js`
  must trace to exactly one row in Section 4.2/4.11. A leftover call to a
  path not in that matrix is a spec gap, not a shortcut to take silently.

## 5. Literal PRD code/SQL/JSON/schema blocks are copied verbatim

Sections 1–5 contain illustrative TypeScript, the full `schema.prisma`
(Section 3), raw SQL (Section 3.1), and the Postman collection JSON
(Section 5.1). Where the PRD gives literal text like this:

- Copy it verbatim into the matching file path (each code block's header
  comment names its destination, e.g. `// src/middleware/auth.ts`).
- The **only** permitted changes while transcribing are the two explicit
  corrections in **Section 4.12**:
  1. `transitionBookingStatus` must accept an injectable Prisma client
     (`client: PrismaClient | Prisma.TransactionClient = prisma`) so it can
     be called from inside an already-open transaction (e.g. from
     `submitReview`) — the as-shown version is not atomic and must not be
     transcribed as-is.
  2. The continuity-scoring query's radius bound must be
     `LEAST(worker's own serviceAreaRadiusKm, platform MAX_SEARCH_RADIUS_KM)`,
     not the flat global constant shown in the raw Section 4.4.1 listing.
- Do not "improve," refactor, paraphrase, or simplify literal PRD text
  beyond those two corrections. Sections 6–29 are prose specs (by design,
  Section 0.3) meant to be implemented directly, not literal code to
  transcribe — those *are* subject to normal engineering judgment.

---

## Build process (Section 28) — do not deviate

- 16 phases, PHASE 0 → PHASE 15, each with a Goal / Required work /
  Verification step, defined in full in Section 28 of `system-blueprint.md`.
- One commit per phase, **only after that phase's Verification step
  actually passes** (real command output, not a description of what would
  happen). Commit message is exactly `phase-N: <description>` as given in
  Section 28 — never `wip`/`fix`/`update`.
- Never combine phases into one commit. Never amend or rewrite a prior
  phase's commit — a defect found in an earlier phase while working on a
  later one is fixed and committed as its own new commit at the current
  point in history (Section 28.16).
- Do not start PHASE N until PHASE N-1's Verification step has actually
  passed.
- If anything in a finished phase deviated from the PRD or was ambiguous,
  stop and ask before starting the next phase — do not guess silently.

## Where things live

- Frontend (existing, being extended in place): `index.html`, `app.js`,
  `mockData.js`, `translations.js`, `worksetu_logo.png` at repo root.
- Backend (new, PHASE 0 onward): `/server` — `src/controllers`,
  `src/services`, `src/middleware`, `src/lib`, `prisma`, `postman`.
- Full spec: `system-blueprint.md` at repo root — always the primary
  reference; this file is a compaction-safe summary of its hardest
  constraints, not a replacement for reading the relevant section before
  implementing it.
