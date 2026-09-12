# Demo Guide — Presenting Worksetu to a Judging Panel

## Demo login credentials (seeded by `prisma:seed`)

| Role | Identifier | Password |
|---|---|---|
| Admin (super-admin/registrar) | `registrar@worksetu.coop` | `AdminPass@123` |
| Sample customer | `anand@example.com` | `Customer@123` |
| Sample worker (plumbing, Chennai) | `ravi.kumar@example.com` | `Worker@123` |

You can also register a brand-new customer/worker live during the demo —
both flows work end-to-end.

## Recommended demo duration

**6-8 minutes** for a standard hackathon slot. Trim to the "Core sequence"
(steps 1-7) for a 4-minute slot; add the admin walkthrough (step 8) if you
have more time.

## Demo flow (core sequence)

1. **Open the deployed frontend URL.** Show the landing page — role
   selector (Customer / Cooperative Worker / Platform Administrator),
   multi-language switcher (EN/HI/TA/BN), platform stats.
2. **Log in as the sample worker** (`ravi.kumar@example.com` /
   `Worker@123`). Show the worker dashboard: availability toggle,
   verification status, cooperative membership. Toggle **Available** —
   point out this starts live location pinging.
3. **Open a second browser tab/window, log in as the sample customer**
   (`anand@example.com` / `Customer@123`). Show the service category grid
   (Plumbing, Electrical, Carpentry, Painting, Caregiving, Gardening,
   Cleaning, Domestic Help).
4. **Submit a booking request** for Plumbing. Show the live "Top 3
   Cooperative Workers Contacted" matching screen — this is the real
   dispatch engine scoring nearby, available, verified workers by distance
   and continuity, not a canned animation.
5. **Switch to the worker tab.** Show the incoming job offer arriving
   (Socket.io push, or the dashboard's own poll-fallback). Accept it.
6. **Switch back to the customer tab**, reload, click Track Request — show
   the booking's live status tracker.
7. **Fast-forward the demo**: rather than waiting out the real 60-second
   auto-confirm window live, narrate it ("the platform auto-confirms 60
   seconds after acceptance — Section 11.1 of the spec — to protect
   against a worker going silent"), then show a booking that's already
   reached Start → Complete → Review → wallet credit (prepare this one
   ahead of time, or accept the real wait if your slot allows it).
8. **Log in as admin** (`registrar@worksetu.coop` / `AdminPass@123`). Show:
   - Workers Directory — verification approve/reject workflow
   - Dispatch monitoring — active dispatch logs
   - Audit Logs — every admin action leaves a trail
9. **Show the payment option** (customer's completed-booking screen →
   Payment Method → Online Payment). Let it return its real response, then
   explain: **"Payment gateway integration is intentionally not connected
   in this prototype — Cash and Direct Pay are fully working manual-record
   options, and the online-gateway slot is a deliberate extension point
   for a future real integration, not a missing feature we ran out of time
   for."**
10. **Close** on product value: cooperative-first gig matching, transparent
    dispatch, worker wallet/earnings, and the honest payment-extension
    design — not a fake demo, a real working backend end to end.

## Backup plan (if the live backend or database has a hiccup)

The demo backend depends on a free-tier Supabase Postgres and Upstash
Redis, both of which can have transient connection latency (see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md)). If something briefly errors mid-demo:

1. **Don't panic-refresh repeatedly** — most transient DB blips resolve
   within a few seconds. Narrate through it ("this is hitting a live
   database, not a canned demo") while it recovers.
2. **Check `/health` and `/ready`** on the backend URL
   (`https://<your-backend>/health`, `/ready`) — `/health` always returns
   200; `/ready` shows exactly which dependency (db/redis) is degraded.
3. **Fall back to the pre-seeded data** — the sample worker/customer
   accounts above and their existing booking history remain visible even
   if a *new* action momentarily fails, so you can keep narrating from
   already-loaded screens.
4. **Have a local copy running** (`npm run dev` in `server/`, `index.html`
   opened directly) as a last-resort fallback if the hosted demo URL is
   unreachable — same seeded credentials work locally.
