import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { paginationQuerySchema, paginate } from "../utils/pagination";

export const listNotifications = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = paginationQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { page, pageSize } = parsed.data;

  const where = { userId: req.user!.id };
  const [items, totalCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.notification.count({ where })
  ]);

  return res.json(paginate(items, page, pageSize, totalCount));
});

export const markNotificationRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  // Section 7.3 — 404, not 403, for a notification that exists but isn't this user's.
  if (!notification || notification.userId !== req.user!.id) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  }
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
  return res.json({ id: updated.id, isRead: updated.isRead });
});

export const markAllNotificationsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true }
  });
  return res.json({ updatedCount: result.count });
});
