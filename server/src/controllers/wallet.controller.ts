// src/controllers/wallet.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { deriveRedeemableBalance, derivePendingBalance, deriveDividendTotal } from "../utils/wallet-balance";

export const getWallet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const worker = await prisma.workerProfile.findUniqueOrThrow({
    where: { userId: req.user!.id },
    include: { cooperative: { select: { location: true, dividendSharePercent: true } } }
  });

  // Fix, not a literal transcription: the illustrative Section 4.7 code
  // derives availableBalance/pendingBalance from the same `take: 50` list
  // it uses for display, which silently understates balance for any
  // worker with more than 50 historical transactions. Balance is derived
  // (Section 1.2.4/13.3) from the full transaction set; only the display
  // list is capped.
  const balanceRows = await prisma.creditTransaction.findMany({
    where: {
      workerProfileId: worker.id,
      OR: [{ status: "COMPLETED" }, { status: "PROCESSING", type: "REDEMPTION" }]
    },
    select: { type: true, amount: true, status: true, createdAt: true }
  });
  const normalizedRows = balanceRows.map((t) => ({ ...t, amount: Number(t.amount) }));
  const availableBalance = deriveRedeemableBalance(normalizedRows);
  const pendingBalance = derivePendingBalance(normalizedRows);
  const dividendPayoutTotal = deriveDividendTotal(normalizedRows);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEarnings = normalizedRows
    .filter((t) => t.status === "COMPLETED" && t.type === "JOB_PAYOUT" && t.createdAt >= todayStart)
    .reduce((sum, t) => sum + t.amount, 0);

  const transactions = await prisma.creditTransaction.findMany({
    where: { workerProfileId: worker.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return res.json({
    availableBalance,
    pendingBalance,
    dividendPayoutTotal,
    dividendSharePercent: worker.cooperative.dividendSharePercent,
    todayEarnings,
    workingLocation: worker.cooperative.location,
    serviceAreaRadiusKm: worker.serviceAreaRadiusKm,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      status: t.status,
      createdAt: t.createdAt
    }))
  });
});

const redeemSchema = z.object({
  amount: z.number().positive(),
  payoutMethod: z.enum(["BANK_TRANSFER_MOCK", "CASH_PICKUP"])
});

export const redeemWallet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const worker = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: req.user!.id } });

  const transactionId = await prisma.$transaction(async (tx) => {
    // Section 13.3 — row-level lock serializes concurrent redemption
    // requests against the same worker's ledger.
    await tx.$queryRaw`SELECT id FROM worker_profiles WHERE id = ${worker.id} FOR UPDATE`;

    // Include already-PROCESSING redemptions, not just COMPLETED rows —
    // otherwise this check never sees money already committed to an
    // in-flight redemption, and the same COMPLETED balance can be
    // redeemed more than once before any prior redemption settles.
    const relevant = await tx.creditTransaction.findMany({
      where: {
        workerProfileId: worker.id,
        OR: [{ status: "COMPLETED" }, { status: "PROCESSING", type: "REDEMPTION" }]
      }
    });
    const balance = deriveRedeemableBalance(relevant.map((t) => ({ ...t, amount: Number(t.amount) })));

    if (parsed.data.amount > balance) {
      throw new AppError(409, "INSUFFICIENT_BALANCE", "Insufficient redeemable balance");
    }

    const created = await tx.creditTransaction.create({
      data: {
        workerProfileId: worker.id,
        type: "REDEMPTION",
        amount: parsed.data.amount,
        status: "PROCESSING",
        payoutMethod: parsed.data.payoutMethod
      }
    });
    return created.id;
  });

  return res.json({ transactionId, status: "PROCESSING" });
});
