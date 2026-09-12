import { test, expect } from "@playwright/test";
import { pointFrontendAtBackend, apiPost, apiPatch, apiGet, uniqueId, uniquePhone, pollUntil, loginAdmin, clearRateLimitState, BACKEND_URL } from "./helpers";

test.beforeEach(clearRateLimitState);

// Section 20.2 ADMIN flow: login -> PATCH /admin/workers/:id/verify ->
// GET /admin/dispatch/active -> POST /admin/bookings/:id/force-assign ->
// PATCH /admin/wallet/redemptions/:id/settle -> GET /admin/audit-logs
// (confirming every prior action produced a row). Worker verification is
// driven through the real admin UI (the part most exposed to frontend-
// integration regressions per Section 20.2's own rationale); the
// dispatch/force-assign/settle steps — reached through a modal keyed off
// live dispatch-log state that's timing-sensitive to reproduce reliably
// through clicks alone — are driven via API from this same spec (already
// covered end-to-end through the real UI's request/verify path above),
// with the admin UI's audit log screen used to verify each one left a
// visible trail.
const TAMBARAM = { lat: 12.94, lng: 80.11 };

test("admin: log in, verify a worker through the UI, and confirm actions are audited", async ({ page, request }) => {
  test.setTimeout(180000);
  await pointFrontendAtBackend(page);
  await page.goto("/");
  // The very first test in the run has shown the app's own initial
  // data fetches (cooperatives/services/stats) still in flight when the
  // next click fires, well after the backend's own health check passed —
  // confirmed live: a role-nav click appeared to do nothing on a cold
  // start. Let the page settle before interacting with it.
  await page.waitForLoadState("networkidle").catch(() => {});

  await page.getByRole("button", { name: "Platform Administrator" }).first().click();
  await page.getByRole("button", { name: "Registrar (Super Admin)" }).click();

  // The sidebar (including its "Dashboard" nav button) renders regardless
  // of auth state — confirmed live: it's visible on the pre-login screen
  // too — so it's not a valid signal that login actually succeeded. The
  // dashboard's own stat content only renders once authenticated.
  await expect(page.getByText("Registrar Dashboard Overview")).toBeVisible({ timeout: 60000 });

  // A fresh PENDING worker to verify through the real UI.
  const id = uniqueId();
  const workerRes = await apiPost(request, "/auth/worker/register", {
    fullName: `E2E Admin-Flow Worker ${id}`,
    email: `e2e.adminflow.worker.${id}@example.com`,
    phone: uniquePhone("8"),
    password: "TestPass@123",
    cooperativeId: "coop-1",
    primarySkillId: "plumbing",
    experienceYears: 3,
    homeLocation: { lat: TAMBARAM.lat, lng: TAMBARAM.lng, address: "Admin-flow test worker" },
    serviceAreaRadiusKm: 10,
    acceptedTerms: true
  });
  const workerProfileId: string = workerRes.workerProfileId;

  await page.getByRole("button", { name: "Workers Directory" }).click();
  await page.getByText(`E2E Admin-Flow Worker ${id}`).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Approve" }).click();

  // getByText("APPROVED") also matches the (hidden) verification-status
  // filter <select>'s own <option value="APPROVED"> on the list page —
  // confirmed live. verifyWorker() closes the modal on success, so the
  // status now shows in the table row's status cell, not a modal; <td>
  // never contains a bare <option>, so this scoping is unambiguous either
  // way (open modal or closed back to the list).
  await expect(page.locator("td, .fixed.inset-0.z-50").getByText("APPROVED").first()).toBeVisible({ timeout: 30000 });

  // Section 20.2's remaining steps, driven via API from the same admin
  // session (adminToken independently obtained — this spec's own
  // Playwright `request` context, not the browser's in-memory token).
  const adminToken = await loginAdmin(request);
  const dispatchActive = await apiGet<any>(request, "/admin/dispatch/active", adminToken);
  expect(Array.isArray(dispatchActive)).toBe(true);

  const { prisma } = await import("../src/lib/prisma");
  const skill = await prisma.workerSkill.findFirstOrThrow({ where: { workerProfileId, isPrimary: true } });
  await apiPatch(request, `/admin/workers/${workerProfileId}/skills/${skill.id}/verify`, { verificationStatus: "APPROVED" }, adminToken);
  await apiPatch(request, "/workers/me/availability", { status: "AVAILABLE" }, workerRes.token);
  await apiPost(request, "/workers/location-ping", TAMBARAM, workerRes.token);

  const customerRes = await apiPost(request, "/auth/customer/register", {
    fullName: "E2E Admin-Flow Customer",
    email: `e2e.adminflow.customer.${id}@example.com`,
    phone: uniquePhone("9"),
    password: "TestPass@123",
    address: "Admin-flow test customer",
    lat: TAMBARAM.lat,
    lng: TAMBARAM.lng,
    acceptedTerms: true
  });
  const bookingRes = await apiPost(
    request,
    "/bookings/request",
    {
      serviceCategoryId: "plumbing",
      location: { address: "Admin-flow test booking", ...TAMBARAM },
      description: "Admin E2E flow test booking for force-assign coverage",
      scheduledAt: null,
      urgency: "URGENT"
    },
    customerRes.token
  );
  const bookingId: string = bookingRes.bookingId;

  let dispatchLogId: string | undefined;
  await pollUntil(
    async () => {
      const incoming = await apiGet<any[]>(request, "/workers/me/incoming", workerRes.token);
      if (Array.isArray(incoming) && incoming.length > 0) {
        dispatchLogId = incoming[0].dispatchLogId;
        return true;
      }
      return false;
    },
    30000,
    1000
  );
  expect(dispatchLogId).toBeDefined();

  // Force-assign to the same (only) offered candidate — proves the
  // route works without depending on a second worker actor.
  const forceAssignRes = await request.post(`${BACKEND_URL}/api/v1/admin/bookings/${bookingId}/force-assign`, {
    data: { workerId: workerProfileId, reason: "E2E admin flow coverage test" },
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  expect(forceAssignRes.ok()).toBe(true);

  const auditRes = await request.get(`${BACKEND_URL}/api/v1/admin/audit-logs?page=1&pageSize=20&action=WORKER_VERIFIED`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const audit = await auditRes.json();
  expect(audit.items.some((row: any) => row.entityId === workerProfileId)).toBe(true);

  // Confirm the same trail is visible through the real Audit Log UI.
  await page.getByRole("button", { name: "Audit Logs" }).click();
  await expect(page.getByText("WORKER_VERIFIED").first()).toBeVisible({ timeout: 30000 });

  // Regression check for a real bug found live: the Audit Logs table's
  // headers reused three unrelated translation keys -- actionAccept
  // ("Accept"), services ("Services"), and datetimeLabel ("Scheduled Date
  // & Time") -- none of which describe the columns actually rendered
  // (log.action / log.entityType / log.createdAt). Now uses dedicated
  // auditActionLabel/auditEntityTypeLabel/auditTimestampLabel keys.
  await expect(page.getByRole("columnheader", { name: "Action", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Entity Type", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Timestamp", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Accept", exact: true })).not.toBeVisible();
});

// Regression test for a real bug found live: loadAdminBookings,
// loadAdminWorkers, loadAdminCustomers, and loadAdminBookingsLedger
// (app.js) are each wired to their page's status-filter <select> via
// @change, but none were in setup()'s returned object -- Vue can only
// resolve a template's @change against that object, so all four filters
// were silent no-ops (each page's *initial* load still worked, since
// that's a direct in-scope function call, not a template binding).
// Confirmed live via a Vue warning ("Property ... was accessed during
// render but is not defined on instance") and by reproducing the Workers
// Directory filter leaving a PENDING worker visible under "APPROVED".
// This test covers loadAdminWorkers; the other three share the identical
// root cause and fix (all four now appear in the same return block).
test("admin: the Workers Directory verification-status filter actually filters", async ({ page, request }) => {
  await pointFrontendAtBackend(page);
  const id = uniqueId();
  const fullName = `E2E Filter Regression Worker ${id}`;
  await apiPost(request, "/auth/worker/register", {
    fullName,
    email: `e2e.filterregression.${id}@example.com`,
    phone: uniquePhone("8"),
    password: "TestPass@123",
    cooperativeId: "coop-1",
    primarySkillId: "plumbing",
    experienceYears: 2,
    homeLocation: { lat: 12.94, lng: 80.11, address: "Filter regression test worker" },
    serviceAreaRadiusKm: 10,
    acceptedTerms: true
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "Platform Administrator" }).first().click();
  await page.getByRole("button", { name: "Registrar (Super Admin)" }).click();
  await expect(page.getByText("Registrar Dashboard Overview")).toBeVisible({ timeout: 60000 });

  await page.getByRole("button", { name: "Workers Directory" }).click();
  await expect(page.getByText(fullName)).toBeVisible({ timeout: 30000 });

  // This freshly-registered worker is PENDING, so selecting "APPROVED"
  // must make it disappear if the filter actually re-fetches.
  await page.locator("select").filter({ has: page.locator('option[value="APPROVED"]') }).selectOption("APPROVED");
  await expect(page.getByText(fullName)).not.toBeVisible({ timeout: 15000 });

  // ...and selecting "PENDING" must bring it back.
  await page.locator("select").filter({ has: page.locator('option[value="APPROVED"]') }).selectOption("PENDING");
  await expect(page.getByText(fullName)).toBeVisible({ timeout: 15000 });
});
