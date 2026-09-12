import { test, expect } from "@playwright/test";
import {
  pointFrontendAtBackend,
  apiPost,
  apiPatch,
  apiGet,
  uniqueId,
  uniquePhone,
  pollUntil,
  loginAdmin,
  clearRateLimitState,
  registerAndApproveWorker,
  BACKEND_URL
} from "./helpers";
import { prisma } from "../src/lib/prisma";

test.beforeEach(clearRateLimitState);

// Section 20.2 WORKER flow: register -> admin verify -> AVAILABLE ->
// dispatch offer received -> accept -> start -> complete -> wallet ->
// redeem. The customer side is driven via API (this spec verifies the
// worker's own UI), isolated at Tambaram so this fresh worker is the sole
// ST_DWithin-eligible candidate (same technique as the Jest integration
// suite's booking-lifecycle test).
const TAMBARAM = { lat: 12.9249, lng: 80.1 };

test("worker: register, get verified, accept a dispatch offer, complete the job, and see wallet credit", async ({
  page,
  request
}) => {
  test.setTimeout(240000);
  await pointFrontendAtBackend(page);
  await page.goto("/");
  // The very first test in the run has shown the app's own initial
  // data fetches (cooperatives/services/stats) still in flight when the
  // next click fires, well after the backend's own health check passed —
  // confirmed live: a role-nav click appeared to do nothing on a cold
  // start. Let the page settle before interacting with it.
  await page.waitForLoadState("networkidle").catch(() => {});

  await page.getByRole("button", { name: "Cooperative Worker" }).first().click();
  await page.getByText("Register here").click();

  const id = uniqueId();
  const email = `e2e.worker.ui.${id}@example.com`;
  await page.locator('input[type="text"]').first().fill("E2E Worker UI");
  // index 0 is the always-present header language picker (EN/HI/TA/BN),
  // not part of this form — confirmed live via direct DOM inspection.
  // The cooperative/skill dropdowns start empty and populate from their
  // own API calls (GET /public/cooperatives, GET /services) — under this
  // environment's demonstrated worst-case latency (observed up to 45s+
  // for a single request), that can outlast Playwright's built-in
  // selectOption retry, so wait for actual options to exist first.
  const coopSelect = page.locator("select").nth(1);
  const skillSelect = page.locator("select").nth(2);
  await expect(coopSelect.locator("option")).not.toHaveCount(0, { timeout: 60000 });
  await expect(skillSelect.locator("option")).not.toHaveCount(0, { timeout: 60000 });
  await coopSelect.selectOption({ label: "Chennai Skilled Workers Cooperative" });
  await skillSelect.selectOption({ label: "Plumbing" });
  await page.locator('input[type="number"]').fill("5");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="tel"]').fill(uniquePhone("8"));
  await page.locator('input[type="text"]').nth(1).fill("Tambaram, Chennai");
  await page.locator('input[type="password"]').fill("TestPass@123");
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Incoming Job Requests")).not.toBeVisible().catch(() => {});
  await expect(page.locator("text=Availability").first()).toBeVisible({ timeout: 45000 });

  // Admin verification (Section 15.1) — driven via API; the ADMIN spec
  // covers the verify UI itself.
  const adminToken = await loginAdmin(request);
  const listRes = await request.get(`${BACKEND_URL}/api/v1/admin/workers?page=1&pageSize=50`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const list = await listRes.json();
  const workerRow = list.items.find((w: any) => w.name === "E2E Worker UI");
  expect(workerRow).toBeDefined();
  const workerProfileId = workerRow.id;

  await apiPatch(request, `/admin/workers/${workerProfileId}/verify`, { decision: "APPROVED" }, adminToken);

  const { prisma } = await import("../src/lib/prisma");
  const skill = await prisma.workerSkill.findFirstOrThrow({ where: { workerProfileId, isPrimary: true } });
  await apiPatch(request, `/admin/workers/${workerProfileId}/skills/${skill.id}/verify`, { verificationStatus: "APPROVED" }, adminToken);

  // Toggle AVAILABLE via the real UI control. The click fires an async
  // PATCH — proceeding immediately to location-ping (below) raced it and
  // hit 409 WORKER_OFF_DUTY live (confirmed via server logs), so this
  // polls until the toggle's own request has actually landed.
  await page.locator(".w-12.h-6.border.border-custom-border.cursor-pointer").first().click();

  // The UI itself never location-pings on a schedule from a scripted
  // browser without real GPS — send one via API using this worker's own
  // freshly-registered session token isn't available to this Node
  // context, so re-login via API with the same credentials just used
  // through the UI (a second, independent session — the two coexist,
  // matching how the real system tolerates multi-device login).
  const loginRes = await request.post(`${BACKEND_URL}/api/v1/auth/worker/login`, {
    data: { identifier: email, password: "TestPass@123" }
  });
  const workerToken: string = (await loginRes.json()).token;

  // Confirms both the availability toggle AND the earlier admin verify/
  // skill-verify writes are durably visible before dispatch is asked to
  // consider this worker — the customer-flow spec showed a freshly-
  // verified worker occasionally not receiving an offer despite every
  // setup call having already resolved 200/OK, consistent with the DB
  // pooler (pgbouncer transaction mode) occasionally not giving a
  // subsequent read the same session's just-committed writes.
  const workerReady = await pollUntil(
    async () => {
      const me = await request.get(`${BACKEND_URL}/api/v1/users/me`, { headers: { Authorization: `Bearer ${workerToken}` } });
      const body = await me.json();
      return body.workerProfile?.availabilityStatus === "AVAILABLE" && body.workerProfile?.verificationStatus === "APPROVED";
    },
    15000,
    1000
  );
  expect(workerReady).toBe(true);

  // The availability toggle (clicked above) itself starts the real UI's
  // own location-pinging loop (startLocationPinging in app.js — an
  // immediate ping plus a 15s interval), using the geolocation mocked in
  // playwright.config.ts. Confirmed live: issuing a second, explicit
  // location-ping here from this API session raced that same UI-triggered
  // ping within the location-ping rate limiter's 5s window (1/5s per
  // worker, keyed regardless of which session/token calls it), producing
  // a genuine 429. Wait for the UI's own ping to land instead of
  // competing with it — lastLocationAt is a plain DateTime column
  // (currentLocation is the PostGIS-typed one), directly queryable.
  const pinged = await pollUntil(
    async () => {
      const wp = await prisma.workerProfile.findUnique({ where: { id: workerProfileId }, select: { lastLocationAt: true } });
      return wp?.lastLocationAt != null && Date.now() - wp.lastLocationAt.getTime() < 120000;
    },
    30000,
    1000
  );
  expect(pinged).toBe(true);

  // Customer side, API-driven.
  const customerId = uniqueId();
  const customerRes = await apiPost(request, "/auth/customer/register", {
    fullName: "E2E Customer (worker-flow)",
    email: `e2e.customer.workerflow.${customerId}@example.com`,
    phone: uniquePhone("9"),
    password: "TestPass@123",
    address: "Tambaram, Chennai",
    lat: TAMBARAM.lat,
    lng: TAMBARAM.lng,
    acceptedTerms: true
  });
  const customerToken: string = customerRes.token;
  const bookingRes = await apiPost(
    request,
    "/bookings/request",
    {
      serviceCategoryId: "plumbing",
      location: { address: "Tambaram, Chennai", ...TAMBARAM },
      description: "Worker E2E flow test booking request, ten-plus chars",
      scheduledAt: null,
      urgency: "URGENT"
    },
    customerToken
  );
  const bookingId: string = bookingRes.bookingId;

  // The real UI's own polling/socket should surface the offer.
  await page.reload();
  await expect(page.getByText("Incoming Job Requests")).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Accept Job" }).click();

  // Section 11.1 auto-confirm (60s after accept) — wait it out via API,
  // then reload so the real UI's Start button appears.
  await pollUntil(
    async () => {
      const res = await request.get(`${BACKEND_URL}/api/v1/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const body = await res.json();
      return body.status === "CONFIRMED";
    },
    90000,
    3000
  );
  // t('startJobBtn')/t('completeJobBtn') render as "Start Service"/"Finish
  // Service" (translations.js), not "Start Job"/"Complete Job" — confirmed
  // live via the failing run's error-context.md page snapshot. The button
  // itself is shown for both ASSIGNED and CONFIRMED (index.html), so the
  // prior failure here was purely this text mismatch.
  await page.reload();
  await expect(page.getByRole("button", { name: "Start Service" })).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Start Service" }).click();

  await expect(page.getByRole("button", { name: "Finish Service" })).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Finish Service" }).click();

  // "Finish Service" triggers workerCompleteJob's own async PATCH
  // /bookings/:id/complete from inside the page — confirmed live: firing
  // the review POST immediately after the click, without confirming that
  // PATCH had actually landed, raced it and got a genuine 409
  // INVALID_STATE (review requires COMPLETED). The test wasn't checking
  // the response, so this passed as a false positive without ever
  // actually crediting the wallet. Wait for COMPLETED first.
  await pollUntil(
    async () => {
      const res = await request.get(`${BACKEND_URL}/api/v1/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const body = await res.json();
      return body.status === "COMPLETED";
    },
    30000,
    1000
  );

  // review.controller.ts, not booking-completion.controller.ts, is where
  // JOB_PAYOUT/FEEDBACK_CREDIT transactions are actually created (a
  // deliberate settlement-on-review design) — Section 20.2's wording
  // ("wallet JOB_PAYOUT visible" right after complete) only holds once
  // the review this spec submits here (via API, customer side) lands.
  // The 30s default actionTimeout was hit live once by a genuine transient
  // DB connection drop (Postgres pooler ECONNRESET) mid-request — the same
  // demonstrated worst-case latency class that drove the Jest integration
  // client's REQUEST_TIMEOUT_MS up to 45000. Match that here.
  const reviewRes = await request.post(`${BACKEND_URL}/api/v1/bookings/${bookingId}/review`, {
    data: { punctuality: 5, quality: 5, professionalism: 5, communication: 5 },
    headers: { Authorization: `Bearer ${customerToken}` },
    timeout: 45000
  });
  expect(reviewRes.ok()).toBe(true);

  await page.getByRole("button", { name: "Earnings" }).click();
  await expect(page.getByText(/₹/).first()).toBeVisible({ timeout: 30000 });

  await page.locator('input[type="number"]').fill("10");
  await page.getByRole("button", { name: "Redeem to Bank" }).click();
  await expect(page.getByText(/₹/).first()).toBeVisible();
});

// Regression test for a real bug found live: getIncentives (worker.controller.ts)
// returned IncentiveProgress rows as-is, and nothing anywhere ever transitioned
// a row out of PENDING once its `expiry` passed — a worker would see a dead
// incentive as still achievable indefinitely. Confirmed via GET /workers/me/incentives
// self-healing PENDING-but-past-expiry rows to EXPIRED on read.
test("worker: an incentive past its expiry is reported as EXPIRED, not PENDING", async ({ page, request }) => {
  await pointFrontendAtBackend(page);
  const worker = await registerAndApproveWorker(request, { lat: 12.9249, lng: 80.1 }, "IncentiveExpiry");

  const staleIncentive = await prisma.incentiveProgress.create({
    data: {
      workerProfileId: worker.workerProfileId,
      title: "Complete 5 jobs this week",
      reward: 200,
      reason: "Weekly job-volume bonus",
      progress: 3,
      target: 5,
      status: "PENDING",
      expiry: new Date(Date.now() - 24 * 60 * 60 * 1000) // yesterday
    }
  });

  const incentives = await apiGet<{ id: string; status: string }[]>(request, "/workers/me/incentives", worker.token);
  const updated = incentives.find((i) => i.id === staleIncentive.id);
  expect(updated?.status).toBe("EXPIRED");

  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "Cooperative Worker" }).first().click();
  await page.locator('input[type="text"]').first().fill(worker.email);
  await page.locator('input[type="password"]').fill(worker.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("text=Availability").first()).toBeVisible({ timeout: 45000 });

  await page.getByRole("button", { name: "Incentives" }).click();
  await expect(page.getByText("Expired", { exact: true }).first()).toBeVisible({ timeout: 15000 });
});

// Regression test for a real bug found live: api.js's onSessionExpired path
// (fired when a 401 survives a refresh attempt -- e.g. an expired/invalid
// refresh cookie) cleared the in-memory access token but never called
// endSession(), so the socket.io connection was left open with the dead
// token. socket.io's default reconnection is infinite, so a left-open tab
// retried the WebSocket (and, for a worker, the location-ping interval)
// forever -- confirmed live via window.ApiClient.isSocketConnected()
// staying true well after the expiry fired.
test("worker: a session expiry (dead refresh cookie) disconnects the socket, not just the token", async ({ page, request, context }) => {
  await pointFrontendAtBackend(page);
  const worker = await registerAndApproveWorker(request, { lat: 12.9249, lng: 80.1 }, "SessionExpiry");

  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "Cooperative Worker" }).first().click();
  await page.locator('input[type="text"]').first().fill(worker.email);
  await page.locator('input[type="password"]').fill(worker.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("text=Availability").first()).toBeVisible({ timeout: 45000 });

  await expect
    .poll(() => page.evaluate(() => (window as any).ApiClient.isSocketConnected()), { timeout: 15000 })
    .toBe(true);

  // Simulate a dead session the same way the live reproduction did: corrupt
  // the in-memory token and wipe the refresh cookie, then drive a real
  // protected request through the app's own client so its 401 -> failed
  // refresh -> onSessionExpired path actually runs (not a hand-rolled stub).
  await context.clearCookies();
  const requestOutcome = await page.evaluate(async () => {
    (window as any).ApiClient.setAccessToken("invalid.forced.token");
    try {
      await (window as any).ApiClient.request("GET", "/users/me");
      return "no error thrown";
    } catch (e: any) {
      return e.message;
    }
  });
  expect(requestOutcome).toMatch(/session has expired/i);

  await expect
    .poll(() => page.evaluate(() => (window as any).ApiClient.isSocketConnected()), { timeout: 15000 })
    .toBe(false);
});
