// src/controllers/admin-worker.controller.ts — Section 1.3.5, Section 15.1's
// worker suspension/reactivation gap-fill.
import { Response } from "express";
import { z } from "zod";
import { VerificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { dispatchNotification } from "../services/notification-dispatcher.service";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { paginationQuerySchema, paginate } from "../utils/pagination";

const workerListQuerySchema = paginationQuerySchema.extend({
  verificationStatus: z.nativeEnum(VerificationStatus).optional()
});

export const listWorkers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = workerListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { page, pageSize, verificationStatus } = parsed.data;

  const where = verificationStatus ? { verificationStatus } : {};
  const [items, totalCount] = await Promise.all([
    prisma.workerProfile.findMany({
      where,
      include: { user: true, cooperative: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.workerProfile.count({ where })
  ]);

  return res.json(
    paginate(
      items.map((w) => ({
        id: w.id,
        name: w.user.fullName,
        phone: w.user.phone,
        cooperativeName: w.cooperative.name,
        verificationStatus: w.verificationStatus,
        availabilityStatus: w.availabilityStatus,
        suspended: w.suspendedAt !== null,
        ratingAverage: w.ratingAverage
      })),
      page,
      pageSize,
      totalCount
    )
  );
});

const verifySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().min(1).max(500).optional()
});

// Section 4.11 — WORKER_VERIFIED / WORKER_REJECTED, metadata.reason
// required on reject only (Section 15.1's "Yes, on REJECTED").
export const verifyWorker = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { decision, rejectionReason } = parsed.data;
  if (decision === "REJECTED" && !rejectionReason) {
    throw new AppError(400, "REASON_REQUIRED", "A rejection reason is required");
  }

  const worker = await prisma.workerProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!worker) {
    throw new AppError(404, "WORKER_NOT_FOUND", "Worker not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workerProfile.update({
      where: { id: worker.id },
      data:
        decision === "APPROVED"
          ? { verificationStatus: "APPROVED", approvedAt: new Date(), approvedByAdminId: req.user!.id, rejectionReason: null }
          : { verificationStatus: "REJECTED", rejectionReason }
    });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: decision === "APPROVED" ? "WORKER_VERIFIED" : "WORKER_REJECTED",
      entityType: "WorkerProfile",
      entityId: worker.id,
      metadata: decision === "REJECTED" ? { reason: rejectionReason } : {}
    });
  });

  await dispatchNotification({
    userId: worker.user.id,
    title: decision === "APPROVED" ? "Verification approved" : "Verification rejected",
    body:
      decision === "APPROVED"
        ? "Your identity verification has been approved. You can now go available for jobs."
        : `Your identity verification was rejected: ${rejectionReason}`
  });

  return res.json({ workerId: worker.id, verificationStatus: decision });
});

const verifySkillSchema = z.object({
  verificationStatus: z.enum(["APPROVED", "REJECTED"]),
  proficiencyLevel: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]).optional()
});

export const verifyWorkerSkill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = verifySkillSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const skill = await prisma.workerSkill.findUnique({ where: { id: req.params.skillId } });
  if (!skill || skill.workerProfileId !== req.params.id) {
    throw new AppError(404, "SKILL_NOT_FOUND", "Worker skill not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workerSkill.update({
      where: { id: skill.id },
      data: {
        verificationStatus: parsed.data.verificationStatus,
        ...(parsed.data.proficiencyLevel ? { proficiencyLevel: parsed.data.proficiencyLevel } : {})
      }
    });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: parsed.data.verificationStatus === "APPROVED" ? "SKILL_VERIFIED" : "SKILL_REJECTED",
      entityType: "WorkerSkill",
      entityId: skill.id
    });
  });

  return res.json({ skillId: skill.id, verificationStatus: parsed.data.verificationStatus });
});

const statusSchema = z.object({ suspended: z.boolean(), reason: z.string().min(1).max(500) });

// Section 15.1 — new endpoint. Sets availability to OFF_DUTY and blocks
// the worker from toggling back to AVAILABLE while suspended = true
// (worker.controller.ts's updateAvailability already enforces the block
// side via WorkerProfile.suspendedAt).
export const setWorkerSuspension = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    if (!(req.body as { reason?: unknown })?.reason) {
      throw new AppError(400, "REASON_REQUIRED", "A reason is required for this action");
    }
    return sendValidationError(req, res, parsed.error);
  }
  const { suspended, reason } = parsed.data;

  const worker = await prisma.workerProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!worker) {
    throw new AppError(404, "WORKER_NOT_FOUND", "Worker not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workerProfile.update({
      where: { id: worker.id },
      data: {
        suspendedAt: suspended ? new Date() : null,
        ...(suspended ? { availabilityStatus: "OFF_DUTY" } : {})
      }
    });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: suspended ? "WORKER_SUSPENDED" : "WORKER_REACTIVATED",
      entityType: "WorkerProfile",
      entityId: worker.id,
      metadata: { reason }
    });
  });

  await dispatchNotification({
    userId: worker.user.id,
    title: suspended ? "Account suspended" : "Account reactivated",
    body: suspended ? `Your account has been suspended: ${reason}` : "Your account has been reactivated."
  });

  return res.json({ workerId: worker.id, suspended });
});
