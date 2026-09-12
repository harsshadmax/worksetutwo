// Section 14.7 — PaymentService adapter boundary. Every payment-method-
// handling code path calls this interface rather than branching on
// paymentMethod inline, so a real gateway is a new adapter later, never a
// rewrite of Booking/Invoice/CreditTransaction/dispatch logic.
import { Prisma, PaymentMethod } from "@prisma/client";
import { prisma } from "../lib/prisma";

export class GatewayNotConfiguredError extends Error {}

export interface PaymentService {
  record(invoiceId: string, method: PaymentMethod, amount: Prisma.Decimal | number): Promise<{ paymentTransactionId: string }>;
}

// Handles CASH/DIRECT_PAY — records a PaymentTransaction for a payment
// that already happened outside the app (Section 14.2). No external call.
// Implemented, P0 (Section 0.4).
export class ManualRecordAdapter implements PaymentService {
  async record(invoiceId: string, method: PaymentMethod, amount: Prisma.Decimal | number): Promise<{ paymentTransactionId: string }> {
    const created = await prisma.paymentTransaction.create({
      data: { invoiceId, paymentMethod: method, paymentStatus: "PAID", amount, processedAt: new Date() }
    });
    return { paymentTransactionId: created.id };
  }
}

// Handles GATEWAY — returns 501 immediately, no external call, no side
// effects, no PaymentTransaction row. This is the default/active adapter
// behind the "Coming Soon" UI state. Implemented, P1 (Section 0.4).
export class UnavailableGatewayAdapter implements PaymentService {
  async record(): Promise<{ paymentTransactionId: string }> {
    throw new GatewayNotConfiguredError();
  }
}

// FutureGatewayAdapter (interface only) — would call a real processor
// (Razorpay/Stripe/other) and handle its webhook/callback. Documented, not
// built — `OUT` (Section 0.4). No implementation, no SDK dependency, no
// API keys anywhere in this codebase. Deliberately not written here — this
// comment is the whole of its footprint in this pass.

export const manualRecordAdapter = new ManualRecordAdapter();
export const unavailableGatewayAdapter = new UnavailableGatewayAdapter();
