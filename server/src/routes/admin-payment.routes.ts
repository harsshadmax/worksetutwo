import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import * as adminPaymentController from "../controllers/admin-payment.controller";

// Section 14's admin-prefixed endpoints (settle, refund, reconciliation)
// — explicitly PHASE 9 scope despite the /admin/* path, since PHASE 9's
// required work claims "Section 14's manual settlement/reconciliation
// endpoints" by name. The rest of the admin console (Section 15) is
// PHASE 11.
const router = Router();

router.patch(
  "/wallet/redemptions/:transactionId/settle",
  requireAdmin,
  authenticatedRateLimit,
  adminPaymentController.settleRedemption
);
router.post("/bookings/:id/refund", requireAdmin, authenticatedRateLimit, adminPaymentController.refundBooking);
router.get("/reports/reconciliation", requireAdmin, authenticatedRateLimit, adminPaymentController.getReconciliationReport);
router.patch(
  "/wallet/settlements/:id/reconcile",
  requireAdmin,
  authenticatedRateLimit,
  adminPaymentController.reconcileSettlement
);

export default router;
