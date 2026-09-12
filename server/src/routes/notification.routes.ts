import { Router } from "express";
import { requireAnyRole } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../controllers/notification.controller";

const router = Router();

router.get("/", requireAnyRole, authenticatedRateLimit, listNotifications);
router.patch("/read-all", requireAnyRole, authenticatedRateLimit, markAllNotificationsRead);
router.patch("/:id/read", requireAnyRole, authenticatedRateLimit, markNotificationRead);

export default router;
