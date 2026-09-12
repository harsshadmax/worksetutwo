// src/controllers/admin-cooperative.controller.ts — Section 1.3.7.
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";

export const listCooperatives = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const cooperatives = await prisma.cooperative.findMany({
    include: { _count: { select: { workers: true } } },
    orderBy: { name: "asc" }
  });
  return res.json(
    cooperatives.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      registrationNumber: c.registrationNumber,
      members: c.members,
      founded: c.founded,
      workerCount: c._count.workers
    }))
  );
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  registrationNumber: z.string().min(1).max(100),
  // Not part of the PRD's illustrative 1.3.7 payload, but Cooperative.founded
  // is a required, non-defaulted schema column (Section 3) — defaulting to
  // the current year when omitted rather than leaving the payload unable to
  // ever persist a row.
  founded: z.number().int().min(1900).max(new Date().getFullYear()).optional()
});

// Section 1.3.7 — routine catalog maintenance, still audited (no reason required).
export const createCooperative = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const cooperative = await prisma.$transaction(async (tx) => {
    const created = await tx.cooperative.create({
      data: {
        name: parsed.data.name,
        location: parsed.data.location,
        registrationNumber: parsed.data.registrationNumber,
        founded: parsed.data.founded ?? new Date().getFullYear()
      }
    });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "COOPERATIVE_CREATED",
      entityType: "Cooperative",
      entityId: created.id
    });
    return created;
  });

  return res.status(201).json({ id: cooperative.id, name: cooperative.name });
});

export const getCooperativeDetail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const cooperative = await prisma.cooperative.findUnique({ where: { id: req.params.id } });
  if (!cooperative) {
    throw new AppError(404, "COOPERATIVE_NOT_FOUND", "Cooperative not found");
  }

  const [activeJobs, completedJobs] = await Promise.all([
    prisma.booking.count({
      where: {
        assignedWorker: { cooperativeId: cooperative.id },
        status: { in: ["ASSIGNED", "CONFIRMED", "IN_PROGRESS"] }
      }
    }),
    prisma.booking.count({
      where: { assignedWorker: { cooperativeId: cooperative.id }, status: { in: ["COMPLETED", "SETTLED"] } }
    })
  ]);

  return res.json({
    id: cooperative.id,
    name: cooperative.name,
    location: cooperative.location,
    registrationNumber: cooperative.registrationNumber,
    members: cooperative.members,
    founded: cooperative.founded,
    activeJobs,
    completedJobs
  });
});
