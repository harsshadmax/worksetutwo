// src/controllers/admin-ledger.controller.ts — Section 1.3.8.
import { Response } from "express";
import { z } from "zod";
import { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { paginationQuerySchema, paginate } from "../utils/pagination";

const listQuerySchema = paginationQuerySchema.extend({ status: z.nativeEnum(BookingStatus).optional() });

export const getBookingLedger = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { page, pageSize, status } = parsed.data;

  const where = status ? { status } : {};
  const [items, totalCount] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { invoice: { include: { paymentTransaction: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.booking.count({ where })
  ]);

  return res.json(
    paginate(
      items.map((b) => ({
        bookingId: b.id,
        status: b.status,
        totalAmount: b.invoice ? Number(b.invoice.totalAmount) : null,
        paymentMethod: b.invoice?.paymentTransaction?.paymentMethod ?? null,
        paymentStatus: b.invoice?.paymentTransaction?.paymentStatus ?? null,
        createdAt: b.createdAt
      })),
      page,
      pageSize,
      totalCount
    )
  );
});

export const getBookingInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const invoice = await prisma.invoice.findUnique({
    where: { bookingId: req.params.id },
    include: { paymentTransaction: true }
  });
  if (!invoice) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found for this booking");
  }

  return res.json({
    invoiceId: invoice.id,
    baseCharge: Number(invoice.baseCharge),
    platformFee: Number(invoice.platformFee),
    totalAmount: Number(invoice.totalAmount),
    paymentMethod: invoice.paymentTransaction?.paymentMethod ?? null,
    paymentStatus: invoice.paymentTransaction?.paymentStatus ?? "PENDING"
  });
});
