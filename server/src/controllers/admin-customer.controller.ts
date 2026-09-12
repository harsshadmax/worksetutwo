// src/controllers/admin-customer.controller.ts — Section 1.3.6.
import { Response } from "express";
import { z } from "zod";
import { AccountStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { dispatchNotification } from "../services/notification-dispatcher.service";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { paginationQuerySchema, paginate } from "../utils/pagination";
import { requireNonEmptyReason } from "../utils/reason";

const listQuerySchema = paginationQuerySchema.extend({ status: z.nativeEnum(AccountStatus).optional() });

export const listCustomers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { page, pageSize, status } = parsed.data;

  const where = { role: "CUSTOMER" as const, ...(status ? { accountStatus: status } : {}) };
  const [items, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { customerProfile: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.user.count({ where })
  ]);

  return res.json(
    paginate(
      items.map((u) => ({
        id: u.customerProfile!.id,
        userId: u.id,
        name: u.fullName,
        phone: u.phone,
        email: u.email,
        accountStatus: u.accountStatus,
        createdAt: u.createdAt
      })),
      page,
      pageSize,
      totalCount
    )
  );
});

const statusBodySchema = z.object({ accountStatus: z.nativeEnum(AccountStatus) });

// Section 4.11 — CUSTOMER_STATUS_CHANGED, metadata.reason required.
export const setCustomerStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const reason = requireNonEmptyReason(req.body);
  const parsed = statusBodySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const customerProfile = await prisma.customerProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!customerProfile) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: customerProfile.userId }, data: { accountStatus: parsed.data.accountStatus } });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "CUSTOMER_STATUS_CHANGED",
      entityType: "User",
      entityId: customerProfile.userId,
      metadata: { reason, accountStatus: parsed.data.accountStatus }
    });
  });

  await dispatchNotification({
    userId: customerProfile.userId,
    title: parsed.data.accountStatus === "SUSPENDED" ? "Account suspended" : "Account reactivated",
    body:
      parsed.data.accountStatus === "SUSPENDED" ? `Your account has been suspended: ${reason}` : "Your account has been reactivated."
  });

  return res.json({ customerId: customerProfile.id, accountStatus: parsed.data.accountStatus });
});
