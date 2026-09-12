// src/controllers/admin-service.controller.ts — Section 1.3.9.
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { invalidateCache } from "../lib/cache";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";

const createSchema = z.object({
  id: z.string().min(1).max(50),
  translationKey: z.string().min(1).max(100),
  baseRate: z.number().nonnegative(),
  hourlyRate: z.number().nonnegative(),
  icon: z.string().min(1).max(50)
});

// Section 1.3.9 — routine catalog maintenance, no reason required, still audited.
export const createService = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const existing = await prisma.serviceCategory.findUnique({ where: { id: parsed.data.id } });
  if (existing) {
    throw new AppError(409, "SERVICE_ALREADY_EXISTS", "A service with this id already exists");
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceCategory.create({ data: parsed.data });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "SERVICE_CREATED",
      entityType: "ServiceCategory",
      entityId: parsed.data.id
    });
  });
  await invalidateCache("services:catalog:all");

  return res.status(201).json({ id: parsed.data.id });
});

const updateSchema = z.object({
  baseRate: z.number().nonnegative().optional(),
  hourlyRate: z.number().nonnegative().optional(),
  isEnabled: z.boolean().optional()
});

// Section 2576 — no DELETE endpoint exists or should be added; disabling
// (isEnabled = false) is the only retirement path, preserving history for
// services with prior bookings.
export const updateService = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const service = await prisma.serviceCategory.findUnique({ where: { id: req.params.id } });
  if (!service) {
    throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceCategory.update({ where: { id: service.id }, data: parsed.data });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "SERVICE_UPDATED",
      entityType: "ServiceCategory",
      entityId: service.id,
      metadata: parsed.data
    });
  });
  await invalidateCache("services:catalog:all");

  return res.json({ id: service.id, ...parsed.data });
});
