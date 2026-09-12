// src/controllers/admin-notification.controller.ts — Section 1.3.10.
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { dispatchNotification } from "../services/notification-dispatcher.service";
import { asyncHandler, sendValidationError } from "../utils/app-error";

const broadcastSchema = z.object({
  audience: z.string().refine(
    (v) => v === "ALL_WORKERS" || v === "ALL_CUSTOMERS" || v.startsWith("COOPERATIVE:"),
    "audience must be ALL_WORKERS, ALL_CUSTOMERS, or COOPERATIVE:{id}"
  ),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000)
});

// Section 15.1 — not a punitive/financial action, no reason required. Fans
// out one Notification row per targeted userId via the existing
// dispatchNotification/InAppChannel path (which already emits
// notification:new per recipient), rather than a bespoke broadcast path.
export const broadcastNotification = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { audience, title, body } = parsed.data;

  let userIds: string[];
  if (audience === "ALL_WORKERS") {
    const users = await prisma.user.findMany({ where: { role: "WORKER" }, select: { id: true } });
    userIds = users.map((u) => u.id);
  } else if (audience === "ALL_CUSTOMERS") {
    const users = await prisma.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true } });
    userIds = users.map((u) => u.id);
  } else {
    const cooperativeId = audience.slice("COOPERATIVE:".length);
    const workers = await prisma.workerProfile.findMany({ where: { cooperativeId }, select: { userId: true } });
    userIds = workers.map((w) => w.userId);
  }

  await Promise.all(userIds.map((userId) => dispatchNotification({ userId, title, body })));

  await writeAuditLog(prisma, {
    actorId: req.user!.id,
    action: "NOTIFICATION_BROADCAST",
    entityType: "Notification",
    entityId: audience,
    metadata: { audience, recipientCount: userIds.length }
  });

  return res.json({ audience, recipientCount: userIds.length });
});

export const getTopSectors = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await prisma.$queryRaw<{ serviceCategoryId: string; translationKey: string; completedCount: bigint }[]>`
    SELECT sc.id AS "serviceCategoryId", sc."translationKey", COUNT(b.id) AS "completedCount"
    FROM service_categories sc
    LEFT JOIN bookings b ON b."serviceCategoryId" = sc.id AND b.status IN ('COMPLETED', 'SETTLED')
    GROUP BY sc.id, sc."translationKey"
    ORDER BY "completedCount" DESC
  `;
  return res.json(rows.map((r) => ({ serviceCategoryId: r.serviceCategoryId, translationKey: r.translationKey, completedCount: Number(r.completedCount) })));
});

export const getRatingDistribution = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await prisma.$queryRaw<{ cooperativeId: string; name: string; avgRating: number | null; workerCount: bigint }[]>`
    SELECT c.id AS "cooperativeId", c.name, AVG(wp."ratingAverage") AS "avgRating", COUNT(wp.id) AS "workerCount"
    FROM cooperatives c
    LEFT JOIN worker_profiles wp ON wp."cooperativeId" = c.id
    GROUP BY c.id, c.name
    ORDER BY "avgRating" DESC NULLS LAST
  `;
  return res.json(
    rows.map((r) => ({
      cooperativeId: r.cooperativeId,
      name: r.name,
      avgRating: r.avgRating !== null ? Number(r.avgRating) : null,
      workerCount: Number(r.workerCount)
    }))
  );
});
