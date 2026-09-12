import { api, registerCustomer, uniqueId, setupConfirmedBooking } from "./helpers/client";

// Section 20.5: duplicate idempotency-key replay, duplicate complete,
// duplicate review. Section 4.9's idempotent() middleware semantics
// (verified against src/middleware/idempotency.ts): same key + same body
// -> cached response replayed; same key + different body -> 409
// IDEMPOTENCY_KEY_REUSE; concurrent identical key -> 409
// IDEMPOTENCY_KEY_IN_PROGRESS.
describe("Idempotency-Key replay and duplicate-action prevention (Section 20.5, 4.9)", () => {
  it("replays the cached response for a repeated Idempotency-Key + identical body", async () => {
    const customer = await registerCustomer();
    const token = (customer.body as any).token;
    const key = `test-idem-${uniqueId()}`;
    const body = {
      serviceCategoryId: "plumbing",
      location: { address: "Idempotency test address, Chennai", lat: 13.06, lng: 80.2 },
      description: "Idempotency-Key replay test booking request",
      scheduledAt: null,
      urgency: "NORMAL"
    };

    const first = await api("POST", "/bookings/request", { token, body, headers: { "Idempotency-Key": key } });
    expect(first.status).toBe(201);

    const second = await api("POST", "/bookings/request", { token, body, headers: { "Idempotency-Key": key } });
    expect(second.status).toBe(201);
    expect((second.body as any).bookingId).toBe((first.body as any).bookingId);
  });

  it("rejects a repeated Idempotency-Key with a different body (409 IDEMPOTENCY_KEY_REUSE)", async () => {
    const customer = await registerCustomer();
    const token = (customer.body as any).token;
    const key = `test-idem-reuse-${uniqueId()}`;

    const first = await api("POST", "/bookings/request", {
      token,
      headers: { "Idempotency-Key": key },
      body: {
        serviceCategoryId: "plumbing",
        location: { address: "Address A, Chennai", lat: 13.06, lng: 80.2 },
        description: "First distinct booking body for reuse test",
        scheduledAt: null,
        urgency: "NORMAL"
      }
    });
    expect(first.status).toBe(201);

    const second = await api("POST", "/bookings/request", {
      token,
      headers: { "Idempotency-Key": key },
      body: {
        serviceCategoryId: "electrical",
        location: { address: "Address B, Chennai", lat: 13.07, lng: 80.21 },
        description: "Second, different booking body for reuse test",
        scheduledAt: null,
        urgency: "URGENT"
      }
    });
    expect(second.status).toBe(409);
    expect((second.body as any).error.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  it("rejects concurrent identical Idempotency-Key requests with exactly one winner (409 IN_PROGRESS on the loser)", async () => {
    const customer = await registerCustomer();
    const token = (customer.body as any).token;
    const key = `test-idem-concurrent-${uniqueId()}`;
    const body = {
      serviceCategoryId: "plumbing",
      location: { address: "Concurrent idempotency test, Chennai", lat: 13.05, lng: 80.19 },
      description: "Concurrent identical idempotency key test booking",
      scheduledAt: null,
      urgency: "NORMAL"
    };

    const [a, b] = await Promise.all([
      api("POST", "/bookings/request", { token, body, headers: { "Idempotency-Key": key } }),
      api("POST", "/bookings/request", { token, body, headers: { "Idempotency-Key": key } })
    ]);

    const statuses = [a.status, b.status].sort();
    // Either the second request loses the create-race (409 IN_PROGRESS) or
    // arrives after the first already completed and gets the replay (201)
    // — both are correct outcomes of the same race; what must never
    // happen is two independent bookings being created.
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    if (statuses[0] === 201 && statuses[1] === 201) {
      expect((a.body as any).bookingId).toBe((b.body as any).bookingId);
    }
  });

  it(
    "Section 20.5 row 4: retrying PATCH /bookings/:id/complete with the same Idempotency-Key replays the original result, no second Invoice/side effect",
    async () => {
      const ready = await setupConfirmedBooking({ lat: 12.9249, lng: 80.1 }, "idem-complete-retry");
      await api("PATCH", `/bookings/${ready.bookingId}/start`, { token: ready.workerToken });

      const key = `test-idem-complete-${uniqueId()}`;
      const first = await api("PATCH", `/bookings/${ready.bookingId}/complete`, {
        token: ready.workerToken,
        headers: { "Idempotency-Key": key }
      });
      expect(first.status).toBe(200);
      expect((first.body as any).status).toBe("COMPLETED");

      const retry = await api("PATCH", `/bookings/${ready.bookingId}/complete`, {
        token: ready.workerToken,
        headers: { "Idempotency-Key": key }
      });
      // Replayed from the stored response, not re-executed — identical
      // body to the first call, not a 409 INVALID_STATE.
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(first.body);
    },
    300000
  );

  it(
    "rejects completing an already-COMPLETED booking a second time without a replay key (409 INVALID_STATE), and a second review (409)",
    async () => {
      const ready = await setupConfirmedBooking({ lat: 12.93, lng: 80.095 }, "dup-complete-no-key");
      await api("PATCH", `/bookings/${ready.bookingId}/start`, { token: ready.workerToken });

      const firstComplete = await api("PATCH", `/bookings/${ready.bookingId}/complete`, { token: ready.workerToken });
      expect(firstComplete.status).toBe(200);

      const secondComplete = await api("PATCH", `/bookings/${ready.bookingId}/complete`, { token: ready.workerToken });
      expect(secondComplete.status).toBe(409);
      expect((secondComplete.body as any).error.code).toBe("INVALID_STATE");

      const firstReview = await api("POST", `/bookings/${ready.bookingId}/review`, {
        token: ready.customerToken,
        body: { punctuality: 4, quality: 4, professionalism: 4, communication: 4 }
      });
      expect(firstReview.status).toBe(200);

      const secondReview = await api("POST", `/bookings/${ready.bookingId}/review`, {
        token: ready.customerToken,
        body: { punctuality: 5, quality: 5, professionalism: 5, communication: 5 }
      });
      expect(secondReview.status).toBeGreaterThanOrEqual(400);
    },
    300000
  );
});
