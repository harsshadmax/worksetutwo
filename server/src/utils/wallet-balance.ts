// src/utils/wallet-balance.ts
//
// Extracted from wallet.controller.ts (was duplicated inline in getWallet
// and redeemWallet) so the balance-derivation sign convention — amount is
// stored positive for every CreditTransaction type except REDEMPTION,
// which is negated only at the point of computing its effective ledger
// contribution — has one definition and is directly unit-testable.
export interface BalanceTransaction {
  type: string;
  amount: number | string;
  status: string;
}

export function effectiveContribution(t: BalanceTransaction): number {
  return t.type === "REDEMPTION" ? -Number(t.amount) : Number(t.amount);
}

export function deriveAvailableBalance(transactions: BalanceTransaction[]): number {
  return transactions.filter((t) => t.status === "COMPLETED").reduce((sum, t) => sum + effectiveContribution(t), 0);
}

export function derivePendingBalance(transactions: BalanceTransaction[]): number {
  return transactions
    .filter((t) => t.status === "PROCESSING" && t.type === "REDEMPTION")
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

// Section 9 threat #13 (wallet manipulation) / Section 13.3 — the amount
// still safe to redeem right now. deriveAvailableBalance alone only sums
// COMPLETED rows, so a REDEMPTION sitting at PROCESSING (already
// requested, not yet settled) is invisible to it; checking eligibility
// against deriveAvailableBalance alone lets a worker (or two concurrent
// requests racing the same row lock, sequentially, one after the other)
// redeem the same COMPLETED balance more than once before any of those
// redemptions actually settles. The true redeemable amount is the
// COMPLETED balance minus whatever is already committed to a pending
// redemption.
export function deriveRedeemableBalance(transactions: BalanceTransaction[]): number {
  return deriveAvailableBalance(transactions) - derivePendingBalance(transactions);
}

// Dividend payouts are a distinct, cooperative-funded credit line (not
// earned from a specific job) — reported separately from availableBalance
// on the worker dashboard rather than folded into it silently.
export function deriveDividendTotal(transactions: BalanceTransaction[]): number {
  return transactions
    .filter((t) => t.status === "COMPLETED" && t.type === "DIVIDEND_PAYOUT")
    .reduce((sum, t) => sum + Number(t.amount), 0);
}
