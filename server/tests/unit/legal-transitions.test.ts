import { LEGAL_TRANSITIONS } from "../../src/services/booking-state-machine.service";
import { BookingStatus } from "@prisma/client";

// Section 11.1's legal-transition table, verified directly against the
// LEGAL_TRANSITIONS lookup used by transitionBookingStatus.
describe("LEGAL_TRANSITIONS (Section 11.1)", () => {
  const HAPPY_PATH: BookingStatus[] = [
    "REQUESTED",
    "DISPATCHING_TOP3",
    "ASSIGNED",
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETED",
    "SETTLED"
  ];

  it("allows every consecutive step of the documented happy path", () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      const from = HAPPY_PATH[i];
      const to = HAPPY_PATH[i + 1];
      expect(LEGAL_TRANSITIONS[from]).toContain(to);
    }
  });

  it("allows DISPATCHING_TOP3 to fall back to DISPATCHING_POOL, and DISPATCHING_POOL to reach ASSIGNED", () => {
    expect(LEGAL_TRANSITIONS.DISPATCHING_TOP3).toContain("DISPATCHING_POOL");
    expect(LEGAL_TRANSITIONS.DISPATCHING_POOL).toContain("ASSIGNED");
  });

  it("allows cancellation from every non-terminal, pre-IN_PROGRESS status", () => {
    for (const status of ["REQUESTED", "DISPATCHING_TOP3", "DISPATCHING_POOL", "ASSIGNED", "CONFIRMED"] as BookingStatus[]) {
      expect(LEGAL_TRANSITIONS[status]).toContain("CANCELLED");
    }
  });

  it("does not allow cancellation once work has started (IN_PROGRESS)", () => {
    expect(LEGAL_TRANSITIONS.IN_PROGRESS).not.toContain("CANCELLED");
  });

  it("treats SETTLED and CANCELLED as terminal — no outgoing transitions", () => {
    expect(LEGAL_TRANSITIONS.SETTLED).toEqual([]);
    expect(LEGAL_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("rejects skipping states (e.g. REQUESTED straight to COMPLETED)", () => {
    expect(LEGAL_TRANSITIONS.REQUESTED).not.toContain("COMPLETED");
    expect(LEGAL_TRANSITIONS.REQUESTED).not.toContain("ASSIGNED");
  });

  it("rejects moving backwards (e.g. COMPLETED back to IN_PROGRESS)", () => {
    expect(LEGAL_TRANSITIONS.COMPLETED).not.toContain("IN_PROGRESS");
    expect(LEGAL_TRANSITIONS.CONFIRMED).not.toContain("ASSIGNED");
  });

  it("covers every BookingStatus enum value with an entry", () => {
    const allStatuses: BookingStatus[] = [
      "REQUESTED",
      "DISPATCHING_TOP3",
      "DISPATCHING_POOL",
      "ASSIGNED",
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETED",
      "SETTLED",
      "CANCELLED"
    ];
    for (const status of allStatuses) {
      expect(LEGAL_TRANSITIONS[status]).toBeDefined();
    }
  });
});
