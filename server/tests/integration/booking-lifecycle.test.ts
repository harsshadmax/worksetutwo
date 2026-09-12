import { api, registerCustomer, registerWorker, loginAdmin, primarySkillId } from "./helpers/client";

// Section 20.2 CUSTOMER + WORKER E2E flow, Jest-native form (also covered
// by newman against postman/api_test_collection.postman_json). The
// customer/worker are placed near Tambaram, Chennai — >10km from every
// seeded AVAILABLE plumber's home location (Ravi in Adyar, Priya in
// Mylapore, both serviceAreaRadiusKm=10) — so the freshly-registered test
// worker is the only ST_DWithin-eligible candidate and receives the
// dispatch offer immediately, instead of waiting through the seeded
// workers' 45s sequential offer timeouts first.
const TAMBARAM = { lat: 12.9249, lng: 80.1 };

function mark(label: string, t0: number) {
  console.log(`[booking-lifecycle] ${label} at +${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

describe("Booking lifecycle (Section 20.2 CUSTOMER + WORKER flow)", () => {
  jest.setTimeout(600000);

  it("runs request -> dispatch -> accept -> start -> complete -> review -> wallet credit", async () => {
    const t0 = Date.now();
    const customer = await registerCustomer({ address: "Tambaram, Chennai", lat: TAMBARAM.lat, lng: TAMBARAM.lng });
    mark("customer registered", t0);
    expect(customer.status).toBe(201);
    const customerToken = (customer.body as any).token;

    const worker = await registerWorker({
      homeLocation: { lat: TAMBARAM.lat, lng: TAMBARAM.lng, address: "Tambaram, Chennai" }
    });
    expect(worker.status).toBe(201);
    mark("worker registered", t0);
    const workerToken = (worker.body as any).token;
    const workerProfileId = (worker.body as any).workerProfileId;

    const adminToken = await loginAdmin();
    const verify = await api("PATCH", `/admin/workers/${workerProfileId}/verify`, {
      token: adminToken,
      body: { decision: "APPROVED" }
    });
    expect(verify.status).toBe(200);
    expect((verify.body as any).verificationStatus).toBe("APPROVED");

    const skillId = await primarySkillId(workerProfileId);
    const skillVerify = await api("PATCH", `/admin/workers/${workerProfileId}/skills/${skillId}/verify`, {
      token: adminToken,
      body: { verificationStatus: "APPROVED" }
    });
    expect(skillVerify.status).toBe(200);
    mark("worker + skill verified", t0);

    const avail = await api("PATCH", "/workers/me/availability", { token: workerToken, body: { status: "AVAILABLE" } });
    expect(avail.status).toBe(200);

    // continuity-scoring.service.ts requires currentLocation IS NOT NULL
    // and a lastLocationAt within 120s — registration only sets
    // homeLocation, so the worker is invisible to dispatch until it pings.
    const ping = await api("POST", "/workers/location-ping", { token: workerToken, body: TAMBARAM });
    expect(ping.status).toBe(200);
    mark("availability + location set", t0);

    const booking = await api("POST", "/bookings/request", {
      token: customerToken,
      body: {
        serviceCategoryId: "plumbing",
        location: { address: "Tambaram, Chennai", lat: TAMBARAM.lat, lng: TAMBARAM.lng },
        description: "Leaking kitchen tap and pipe needs replacement",
        scheduledAt: null,
        urgency: "URGENT"
      }
    });
    expect(booking.status).toBe(201);
    expect((booking.body as any).status).toBe("REQUESTED");
    const bookingId = (booking.body as any).bookingId;
    mark("booking requested", t0);

    let dispatchLogId: string | undefined;
    for (let attempt = 0; attempt < 15 && !dispatchLogId; attempt++) {
      const incoming = await api("GET", "/workers/me/incoming", { token: workerToken });
      expect(incoming.status).toBe(200);
      if (Array.isArray(incoming.body) && incoming.body.length > 0) {
        dispatchLogId = incoming.body[0].dispatchLogId;
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    expect(dispatchLogId).toBeDefined();
    mark("dispatch offer received", t0);

    const accept = await api("POST", `/dispatch/${dispatchLogId}/respond`, { token: workerToken, body: { response: "ACCEPT" } });
    expect(accept.status).toBe(200);
    expect((accept.body as any).outcome).toBe("ACCEPTED");
    mark("dispatch accepted", t0);

    // Section 11.1 — accept sets ASSIGNED, then dispatch.controller.ts
    // auto-confirms to CONFIRMED exactly 60s after accept (grace window
    // for the customer to cancel); /start requires CONFIRMED. Poll every
    // few seconds rather than one long sleep — a single idle gap this
    // long was observed to trip a keep-alive/connection-pool reset
    // (ECONNRESET) on this host, whereas short, regular round trips keep
    // the connection active.
    let confirmed = false;
    for (let attempt = 0; attempt < 25 && !confirmed; attempt++) {
      const current = await api("GET", `/bookings/${bookingId}`, { token: customerToken });
      if ((current.body as any).status === "CONFIRMED") {
        confirmed = true;
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    expect(confirmed).toBe(true);
    mark("booking auto-confirmed", t0);

    const start = await api("PATCH", `/bookings/${bookingId}/start`, { token: workerToken });
    expect(start.status).toBe(200);
    mark("worker started", t0);

    const complete = await api("PATCH", `/bookings/${bookingId}/complete`, { token: workerToken });
    expect(complete.status).toBe(200);
    expect((complete.body as any).status).toBe("COMPLETED");
    mark("worker completed", t0);

    const review = await api("POST", `/bookings/${bookingId}/review`, {
      token: customerToken,
      body: { punctuality: 5, quality: 5, professionalism: 5, communication: 5, writtenFeedback: "Quick and professional" }
    });
    expect(review.status).toBe(200);
    expect((review.body as any).overallScore).toBe(5);
    expect((review.body as any).creditIssued).toBeGreaterThan(0);
    mark("review submitted, credit issued", t0);

    const wallet = await api("GET", "/workers/me/wallet", { token: workerToken });
    expect(wallet.status).toBe(200);
    expect(typeof (wallet.body as any).availableBalance).toBe("number");
    expect((wallet.body as any).availableBalance).toBeGreaterThan(0);
    mark("wallet balance confirmed", t0);
  });
});
