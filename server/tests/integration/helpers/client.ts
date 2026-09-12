import "dotenv/config";
import { readServerState } from "./server-state";
import { prisma } from "../../../src/lib/prisma";

export function baseUrl(): string {
  return readServerState().baseUrl;
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

// Node's fetch() has no default timeout — a stalled connection (observed
// on this host after a request follows an idle gap, likely a keep-alive/
// connection-pool edge case) hangs forever instead of failing, silently
// eating an entire test's budget. Every call gets a bounded per-request
// timeout, plus a couple of retries on abort/network-level failure only
// — a real HTTP response (any status code) is never retried or masked.
// This environment's Supabase pooler has shown per-request latency
// ranging from under a second up to 30s+ under load; bounded generously
// so a real (if severe) slow response is distinguished from a genuine
// stalled connection, rather than tripped by ordinary variance.
const REQUEST_TIMEOUT_MS = 45000;
const MAX_TRANSPORT_RETRIES = 3;

async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T = any>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  };
  const url = `${baseUrl()}${path}`;

  // Retrying after a client-side timeout is only safe when the server
  // guarantees a replay instead of re-execution: GET is naturally safe;
  // any other method is only safe if the caller sent an Idempotency-Key
  // (Section 4.9 — the server dedupes on key+body and returns the
  // original result). Retrying a bare mutating call risks the exact bug
  // this comment used to not have: the first attempt actually succeeds
  // server-side, the response is merely slow to arrive, and the "retry"
  // lands on already-mutated state and reports a false failure.
  const headerKeys = Object.keys(options.headers ?? {}).map((k) => k.toLowerCase());
  const retrySafe = method === "GET" || headerKeys.includes("idempotency-key");
  const attempts = retrySafe ? MAX_TRANSPORT_RETRIES : 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetchOnce(url, init);
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: res.status, body: body as T };
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw new Error(`api() ${method} ${path} failed after ${attempts} attempt(s): ${lastErr}`);
}

let counter = 0;
export function uniqueId(): string {
  counter += 1;
  return `${Date.now()}${counter}`;
}

// Phase-13 finding: `9${uniqueId()}`.slice(0, 10) was a real, reproducible
// bug — Date.now() alone is already 13 digits, so slicing the first 10
// characters of a leading-digit + timestamp + counter string always takes
// "9" plus the first 9 digits of Date.now(), silently dropping the
// counter that was supposed to make each call unique. Every registration
// within the same ~10-second window got the identical phone number,
// producing a 409 ACCOUNT_ALREADY_EXISTS that looked like account-conflict
// or rate-limit flakiness but was really this. The counter must be the
// part that survives truncation.
let phoneCounter = 0;
export function uniquePhone(leadingDigit: string): string {
  phoneCounter += 1;
  return `${leadingDigit}${String(phoneCounter).padStart(4, "0")}${String(Date.now()).slice(-5)}`;
}

export async function registerCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  const id = uniqueId();
  const payload = {
    fullName: "Test Customer",
    email: `test.customer.${id}@example.com`,
    phone: uniquePhone("9"),
    password: "TestPass@123",
    address: "54, Gandhi Nagar Main Road, Adyar, Chennai",
    lat: 13.0064,
    lng: 80.2569,
    acceptedTerms: true,
    ...overrides
  };
  const res = await api("POST", "/auth/customer/register", { body: payload });
  return { ...res, payload };
}

export async function registerWorker(overrides: Partial<Record<string, unknown>> = {}) {
  const id = uniqueId();
  const payload = {
    fullName: "Test Worker",
    email: `test.worker.${id}@example.com`,
    phone: uniquePhone("8"),
    password: "TestPass@123",
    cooperativeId: "coop-1",
    primarySkillId: "plumbing",
    experienceYears: 5,
    homeLocation: { lat: 13.0012, lng: 80.2565, address: "Adyar, Chennai" },
    serviceAreaRadiusKm: 10,
    acceptedTerms: true,
    ...overrides
  };
  const res = await api("POST", "/auth/worker/register", { body: payload });
  return { ...res, payload };
}

// Registration only creates the primary WorkerSkill as PENDING; the
// continuity-scoring query requires it APPROVED, which has no HTTP path
// other than admin-worker.controller.ts's verifyWorkerSkill, keyed by
// skillId — not returned by any registration/list response — so this is
// read directly from the DB, same as the seed script does for demo data.
//
// This is a direct Prisma call from the test process, bypassing api()'s
// own retry/timeout handling — retried here too, since this environment's
// Supabase pooler has shown transient P1001 connection drops even to a
// single simple read (observed live: this exact call failed once with
// "Can't reach database server" on an otherwise-healthy run).
export async function primarySkillId(workerProfileId: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const skill = await prisma.workerSkill.findFirstOrThrow({ where: { workerProfileId, isPrimary: true } });
      return skill.id;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

export interface ReadyBooking {
  bookingId: string;
  customerToken: string;
  workerToken: string;
  workerProfileId: string;
}

// Shared setup for tests that need a booking already in CONFIRMED status
// (ready for /start): register + verify + skill-verify + availability +
// location-ping, request a booking, wait for the (sole, isolated) test
// worker's dispatch offer, accept it, then poll for the 60s auto-confirm.
// Polls in short increments rather than one long sleep — a single idle
// gap near 60s was observed to trip a keep-alive/connection-pool reset on
// this host.
export async function setupConfirmedBooking(coords: { lat: number; lng: number }, label: string): Promise<ReadyBooking> {
  const customer = await registerCustomer({ address: `${label} customer`, lat: coords.lat, lng: coords.lng });
  const worker = await registerWorker({ homeLocation: { lat: coords.lat, lng: coords.lng, address: `${label} worker` } });
  const customerToken = (customer.body as any).token;
  const workerToken = (worker.body as any).token;
  const workerProfileId = (worker.body as any).workerProfileId;
  const adminToken = await loginAdmin();

  await api("PATCH", `/admin/workers/${workerProfileId}/verify`, { token: adminToken, body: { decision: "APPROVED" } });
  const skillId = await primarySkillId(workerProfileId);
  await api("PATCH", `/admin/workers/${workerProfileId}/skills/${skillId}/verify`, {
    token: adminToken,
    body: { verificationStatus: "APPROVED" }
  });
  await api("PATCH", "/workers/me/availability", { token: workerToken, body: { status: "AVAILABLE" } });
  await api("POST", "/workers/location-ping", { token: workerToken, body: coords });

  const booking = await api("POST", "/bookings/request", {
    token: customerToken,
    body: {
      serviceCategoryId: "plumbing",
      location: { address: `${label} booking address`, ...coords },
      description: `${label} setupConfirmedBooking test request, ten-plus chars`,
      scheduledAt: null,
      urgency: "URGENT"
    }
  });
  const bookingId = (booking.body as any).bookingId;

  let dispatchLogId: string | undefined;
  for (let i = 0; i < 15 && !dispatchLogId; i++) {
    const incoming = await api("GET", "/workers/me/incoming", { token: workerToken });
    if (Array.isArray(incoming.body) && incoming.body.length > 0) dispatchLogId = incoming.body[0].dispatchLogId;
    else await new Promise((r) => setTimeout(r, 1000));
  }
  if (!dispatchLogId) throw new Error("setupConfirmedBooking: no dispatch offer received");
  await api("POST", `/dispatch/${dispatchLogId}/respond`, { token: workerToken, body: { response: "ACCEPT" } });

  let confirmed = false;
  for (let i = 0; i < 25 && !confirmed; i++) {
    const current = await api("GET", `/bookings/${bookingId}`, { token: customerToken });
    if ((current.body as any).status === "CONFIRMED") confirmed = true;
    else await new Promise((r) => setTimeout(r, 3000));
  }
  if (!confirmed) throw new Error("setupConfirmedBooking: booking never reached CONFIRMED");

  return { bookingId, customerToken, workerToken, workerProfileId };
}

export async function loginAdmin(): Promise<string> {
  const res = await api("POST", "/auth/admin/login", {
    body: { identifier: "registrar@worksetu.coop", password: "AdminPass@123" }
  });
  if (res.status !== 200) throw new Error(`Admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as any).token;
}
