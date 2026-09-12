import {
  deriveAvailableBalance,
  derivePendingBalance,
  deriveRedeemableBalance,
  deriveDividendTotal,
  effectiveContribution
} from "../../src/utils/wallet-balance";

// Section 13.3 ledger sign convention (established in Phase 11):
// CreditTransaction.amount is stored positive for every type; only
// REDEMPTION is negated, and only at the point of computing its effective
// contribution to the balance — never in the stored value itself.
describe("wallet balance derivation", () => {
  it("sums COMPLETED earnings and incentives as positive contributions", () => {
    const txns = [
      { type: "EARNING", amount: 200, status: "COMPLETED" },
      { type: "INCENTIVE", amount: 50, status: "COMPLETED" },
      { type: "FEEDBACK_CREDIT", amount: 10, status: "COMPLETED" }
    ];
    expect(deriveAvailableBalance(txns)).toBe(260);
  });

  it("subtracts COMPLETED redemptions from the balance", () => {
    const txns = [
      { type: "EARNING", amount: 200, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 80, status: "COMPLETED" }
    ];
    expect(deriveAvailableBalance(txns)).toBe(120);
  });

  it("ignores non-COMPLETED rows when computing available balance", () => {
    const txns = [
      { type: "EARNING", amount: 200, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 80, status: "PROCESSING" }
    ];
    expect(deriveAvailableBalance(txns)).toBe(200);
  });

  it("sums only PROCESSING redemptions as pending balance", () => {
    const txns = [
      { type: "EARNING", amount: 200, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 30, status: "PROCESSING" },
      { type: "REDEMPTION", amount: 20, status: "PROCESSING" },
      { type: "REDEMPTION", amount: 999, status: "COMPLETED" }
    ];
    expect(derivePendingBalance(txns)).toBe(50);
  });

  it("REVERSAL of a REDEMPTION contributes positively (money credited back)", () => {
    // Phase-11 correctness fix: a REVERSAL row stores its own correct
    // effective sign directly, so reversing a REDEMPTION must show up as
    // a credit, not a further debit.
    const txns = [
      { type: "EARNING", amount: 100, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 40, status: "COMPLETED" },
      { type: "REVERSAL", amount: 40, status: "COMPLETED" }
    ];
    expect(deriveAvailableBalance(txns)).toBe(100);
  });

  it("ADJUSTMENT stores its own effective sign (a debit adjustment is negative)", () => {
    const txns = [
      { type: "EARNING", amount: 100, status: "COMPLETED" },
      { type: "ADJUSTMENT", amount: -25, status: "COMPLETED" }
    ];
    expect(deriveAvailableBalance(txns)).toBe(75);
  });

  it("effectiveContribution negates REDEMPTION only", () => {
    expect(effectiveContribution({ type: "REDEMPTION", amount: 50, status: "COMPLETED" })).toBe(-50);
    expect(effectiveContribution({ type: "EARNING", amount: 50, status: "COMPLETED" })).toBe(50);
  });

  it("handles Prisma Decimal-style string amounts", () => {
    const txns = [{ type: "EARNING", amount: "199.50", status: "COMPLETED" }];
    expect(deriveAvailableBalance(txns)).toBeCloseTo(199.5);
  });
});

// Phase-13 finding: deriveAvailableBalance alone (COMPLETED rows only)
// never accounts for a REDEMPTION already sitting at PROCESSING, so
// checking eligibility against it lets the same balance be redeemed more
// than once before any prior redemption settles — caught by
// tests/integration/race-conditions.test.ts's redemption-race test.
describe("deriveRedeemableBalance (Section 9 threat #13 fix)", () => {
  it("subtracts an in-flight PROCESSING redemption from the COMPLETED balance", () => {
    const txns = [
      { type: "EARNING", amount: 100, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 100, status: "PROCESSING" }
    ];
    expect(deriveRedeemableBalance(txns)).toBe(0);
  });

  it("rejects a second redemption for the full balance while the first is still PROCESSING", () => {
    const afterFirstRedemption = [
      { type: "EARNING", amount: 100, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 100, status: "PROCESSING" }
    ];
    const requestedAmount = 100;
    expect(requestedAmount > deriveRedeemableBalance(afterFirstRedemption)).toBe(true);
  });

  it("is unaffected by an already-COMPLETED (settled) redemption, which deriveAvailableBalance already handles", () => {
    const txns = [
      { type: "EARNING", amount: 100, status: "COMPLETED" },
      { type: "REDEMPTION", amount: 60, status: "COMPLETED" }
    ];
    expect(deriveRedeemableBalance(txns)).toBe(40);
  });

  it("matches deriveAvailableBalance when there is no pending redemption", () => {
    const txns = [{ type: "EARNING", amount: 250, status: "COMPLETED" }];
    expect(deriveRedeemableBalance(txns)).toBe(deriveAvailableBalance(txns));
  });
});

// Cooperative dividends (admin-wallet-ops.controller.ts#distributeDividends)
// are a distinct credit line from job earnings, reported separately on the
// worker dashboard rather than folded into availableBalance.
describe("deriveDividendTotal", () => {
  it("sums only COMPLETED DIVIDEND_PAYOUT rows", () => {
    const txns = [
      { type: "JOB_PAYOUT", amount: 500, status: "COMPLETED" },
      { type: "DIVIDEND_PAYOUT", amount: 60, status: "COMPLETED" },
      { type: "DIVIDEND_PAYOUT", amount: 40, status: "COMPLETED" }
    ];
    expect(deriveDividendTotal(txns)).toBe(100);
  });

  it("excludes a PROCESSING dividend payout (there's no such state today, but the filter should still be exact)", () => {
    const txns = [{ type: "DIVIDEND_PAYOUT", amount: 100, status: "PROCESSING" }];
    expect(deriveDividendTotal(txns)).toBe(0);
  });

  it("is zero for a worker with job earnings but no dividend history yet", () => {
    const txns = [{ type: "JOB_PAYOUT", amount: 1000, status: "COMPLETED" }];
    expect(deriveDividendTotal(txns)).toBe(0);
  });

  it("does not count dividend payouts toward deriveAvailableBalance separately -- it's already included there as a positive contribution, same as any other non-REDEMPTION type", () => {
    const txns = [
      { type: "JOB_PAYOUT", amount: 500, status: "COMPLETED" },
      { type: "DIVIDEND_PAYOUT", amount: 60, status: "COMPLETED" }
    ];
    expect(deriveAvailableBalance(txns)).toBe(560);
    expect(deriveDividendTotal(txns)).toBe(60);
  });
});
