import { APIRequestContext, Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

export const BACKEND_URL = "http://localhost:4400";
const API_BASE = `${BACKEND_URL}/api/v1`;

// Points the frontend's window.WORKSETU_API_BASE override (api.js) at the
// dedicated E2E backend instance before any app script runs.
export async function pointFrontendAtBackend(page: Page): Promise<void> {
  await page.addInitScript((base) => {
    (window as any).WORKSETU_API_BASE = base;
  }, BACKEND_URL);
}

let counter = 0;
export function uniqueId(): string {
  counter += 1;
  return `${Date.now()}${counter}`;
}

// Phase-13 finding (see tests/integration/helpers/client.ts): Date.now()
// is already 13 digits, so `${leadingDigit}${uniqueId()}`.slice(0, 10)
// always takes the leading digit plus the first 9 digits of Date.now(),
// silently dropping the counter and producing identical phone numbers
// for every call within the same ~10s window — a real 409
// ACCOUNT_ALREADY_EXISTS, not flakiness. The counter must survive.
let phoneCounter = 0;
export function uniquePhone(leadingDigit: string): string {
  phoneCounter += 1;
  return `${leadingDigit}${String(phoneCounter).padStart(4, "0")}${String(Date.now()).slice(-5)}`;
}

export async function apiPost<T = any>(request: APIRequestContext, path: string, data: unknown, token?: string): Promise<T> {
  const res = await request.post(`${API_BASE}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return res.json();
}

export async function apiPatch<T = any>(request: APIRequestContext, path: string, data: unknown, token: string): Promise<T> {
  const res = await request.patch(`${API_BASE}${path}`, { data, headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function apiGet<T = any>(request: APIRequestContext, path: string, token: string): Promise<T> {
  const res = await request.get(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function loginAdmin(request: APIRequestContext): Promise<string> {
  const res = await apiPost(request, "/auth/admin/login", {
    identifier: "registrar@worksetu.coop",
    password: "AdminPass@123"
  });
  return res.token;
}

export interface RegisteredWorker {
  token: string;
  workerProfileId: string;
  email: string;
  password: string;
  fullName: string;
}

// Registration + full (profile + skill) verification for a throwaway
// worker, used to play the "other side" of a flow whose own UI this spec
// isn't exercising. Section 4.2 has no HTTP path that returns a
// WorkerSkill id (only the admin skill-verify route, keyed by one) — read
// directly from Postgres, same as prisma/seed.ts does for demo data and
// server/tests/integration/helpers/client.ts's primarySkillId does for
// the Jest integration suite.
export async function registerAndApproveWorker(
  request: APIRequestContext,
  coords: { lat: number; lng: number },
  label: string
): Promise<RegisteredWorker> {
  const id = uniqueId();
  const fullName = `E2E Worker ${label}`;
  const email = `e2e.worker.${id}@example.com`;
  const password = "TestPass@123";

  const registerRes = await apiPost(request, "/auth/worker/register", {
    fullName,
    email,
    phone: uniquePhone("8"),
    password,
    cooperativeId: "coop-1",
    primarySkillId: "plumbing",
    experienceYears: 5,
    homeLocation: { lat: coords.lat, lng: coords.lng, address: `${label} worker home` },
    serviceAreaRadiusKm: 10,
    acceptedTerms: true
  });
  const token: string = registerRes.token;
  const workerProfileId: string = registerRes.workerProfileId;

  const adminToken = await loginAdmin(request);
  await apiPatch(request, `/admin/workers/${workerProfileId}/verify`, { decision: "APPROVED" }, adminToken);

  const skill = await prisma.workerSkill.findFirstOrThrow({ where: { workerProfileId, isPrimary: true } });
  await apiPatch(request, `/admin/workers/${workerProfileId}/skills/${skill.id}/verify`, { verificationStatus: "APPROVED" }, adminToken);

  await apiPatch(request, "/workers/me/availability", { status: "AVAILABLE" }, token);
  await apiPost(request, "/workers/location-ping", { lat: coords.lat, lng: coords.lng }, token);

  // Dispatch eligibility (continuity-scoring.service.ts) needs all of the
  // above to be durably visible — the customer-flow spec has shown this
  // worker occasionally not receiving an offer despite every setup call
  // above having resolved 200/OK, consistent with the DB pooler
  // (pgbouncer transaction mode) occasionally not giving a subsequent
  // read the same session's just-committed writes. Confirming via a
  // fresh read closes that gap.
  const ready = await pollUntil(
    async () => {
      const me = await request.get(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await me.json();
      return body.workerProfile?.verificationStatus === "APPROVED" && body.workerProfile?.availabilityStatus === "AVAILABLE";
    },
    15000,
    1000
  );
  if (!ready) throw new Error("registerAndApproveWorker: worker never became visibly APPROVED/AVAILABLE");

  return { token, workerProfileId, email, password, fullName };
}

// global-setup.ts only clears rl:* once per `npx playwright test` invocation.
// Confirmed live: the 3 specs cumulatively issue 6+ registrations in one
// run (admin-flow 2, customer-flow's own + registerAndApproveWorker's 2,
// worker-flow's UI reg + its own customer reg), exceeding the 5/hour/IP
// registerLimiter partway through the last test — same class of bug as the
// Jest integration suite's registerLimiter finding, fixed there via
// per-test (not per-file) clearing. Call this from each spec's own
// test.beforeEach for the same reason.
export async function clearRateLimitState(): Promise<void> {
  const Redis = require("ioredis");
  const client = new Redis(process.env.REDIS_URL);
  try {
    const keys = await client.keys("rl:*");
    if (keys.length > 0) await client.del(keys);
  } finally {
    client.disconnect();
  }
}

export async function pollUntil(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
