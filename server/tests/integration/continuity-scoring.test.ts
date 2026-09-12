import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { scoreCandidateWorkers } from "../../src/services/continuity-scoring.service";
import { api } from "./helpers/client";

// Section 4.12 item 2 correction: the eligibility/scoring radius is
// LEAST(worker's own serviceAreaRadiusKm, platform ceiling), not the flat
// platform ceiling alone. Verified directly against the live DB (this is
// a raw $queryRaw function, not a pure function — SQL correctness can
// only be verified by actually running it).
describe("continuity-scoring.service.ts (Section 4.12 item 2 radius correction)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("excludes a worker whose own serviceAreaRadiusKm is smaller than the platform ceiling and is out of that smaller radius", async () => {
    // Ravi Kumar (worker-1, seeded): Adyar, serviceAreaRadiusKm=10. A
    // point ~14km away is within the 15km platform ceiling used elsewhere
    // in this suite, but outside Ravi's own 10km — the correction's whole
    // point is that this must exclude him even though the flat-ceiling
    // version of Section 4.4.1 would have included him.
    const FAR_WITHIN_CEILING_NOT_WITHIN_OWN_RADIUS = { lat: 13.1, lng: 80.35 }; // ~14km from Adyar

    const candidates = await scoreCandidateWorkers({
      serviceCategoryId: "plumbing",
      customerId: "cust-2",
      lng: FAR_WITHIN_CEILING_NOT_WITHIN_OWN_RADIUS.lng,
      lat: FAR_WITHIN_CEILING_NOT_WITHIN_OWN_RADIUS.lat,
      maxRadiusKm: 15
    });

    const ravi = await prisma.workerProfile.findFirst({ where: { user: { email: "ravi.kumar@example.com" } } });
    expect(ravi).not.toBeNull();
    expect(candidates.some((c) => c.workerId === ravi!.id)).toBe(false);
  });

  it("includes a worker within both their own radius and the platform ceiling", async () => {
    // The eligibility filter also requires lastLocationAt within the last
    // 120 seconds (Section 12.6) — seeded demo data's location timestamp
    // is from whenever the DB was last seeded, not "now", so Ravi is
    // otherwise excluded here regardless of the radius correction being
    // right or wrong. A real ping makes him freshly eligible.
    const raviLogin = await api("POST", "/auth/worker/login", {
      body: { identifier: "ravi.kumar@example.com", password: "Worker@123" }
    });
    await api("POST", "/workers/location-ping", { token: raviLogin.body.token, body: { lat: 13.0012, lng: 80.2565 } });

    const NEAR_ADYAR = { lat: 13.01, lng: 80.258 }; // <1km from Ravi's home location
    const candidates = await scoreCandidateWorkers({
      serviceCategoryId: "plumbing",
      customerId: "cust-2",
      lng: NEAR_ADYAR.lng,
      lat: NEAR_ADYAR.lat,
      maxRadiusKm: 15
    });
    const ravi = await prisma.workerProfile.findFirst({ where: { user: { email: "ravi.kumar@example.com" } } });
    expect(candidates.some((c) => c.workerId === ravi!.id)).toBe(true);
  });

  it("excludes an AVAILABLE-but-wrong-skill worker (electrical) from a plumbing search", async () => {
    const NEAR_VELACHERY = { lat: 12.9756, lng: 80.2209 };
    const candidates = await scoreCandidateWorkers({
      serviceCategoryId: "plumbing",
      customerId: "cust-2",
      lng: NEAR_VELACHERY.lng,
      lat: NEAR_VELACHERY.lat,
      maxRadiusKm: 15
    });
    const rajesh = await prisma.workerProfile.findFirst({ where: { user: { email: "rajesh.kannan@example.com" } } });
    expect(candidates.some((c) => c.workerId === rajesh!.id)).toBe(false);
  });

  it("excludes an OFF_DUTY worker even if otherwise eligible", async () => {
    const NEAR_TNAGAR = { lat: 13.0418, lng: 80.2341 };
    const candidates = await scoreCandidateWorkers({
      serviceCategoryId: "plumbing",
      customerId: "cust-2",
      lng: NEAR_TNAGAR.lng,
      lat: NEAR_TNAGAR.lat,
      maxRadiusKm: 15
    });
    const suresh = await prisma.workerProfile.findFirst({ where: { user: { email: "suresh.babu@example.com" } } });
    expect(candidates.some((c) => c.workerId === suresh!.id)).toBe(false);
  });
});
