// src/controllers/admin-dashboard.controller.ts — Section 1.3.1.
import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../utils/app-error";

const ACTIVE_STATUSES = ["REQUESTED", "DISPATCHING_TOP3", "DISPATCHING_POOL", "ASSIGNED", "CONFIRMED", "IN_PROGRESS"] as const;

export const getDashboardSummary = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const [
    totalWorkers,
    availableWorkers,
    totalCustomers,
    activeBookings,
    completedBookings,
    totalCooperatives,
    recentDispatchLogs
  ] = await Promise.all([
    prisma.workerProfile.count(),
    prisma.workerProfile.count({ where: { availabilityStatus: "AVAILABLE" } }),
    prisma.customerProfile.count(),
    prisma.booking.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.booking.count({ where: { status: { in: ["COMPLETED", "SETTLED"] } } }),
    prisma.cooperative.count(),
    prisma.dispatchLog.findMany({ orderBy: { offeredAt: "desc" }, take: 10 })
  ]);

  return res.json({
    totalWorkers,
    availableWorkers,
    totalCustomers,
    activeBookings,
    completedBookings,
    totalCooperatives,
    recentDispatchEvents: recentDispatchLogs.map((d) => ({ bookingId: d.bookingId, event: d.outcome, at: d.offeredAt }))
  });
});
