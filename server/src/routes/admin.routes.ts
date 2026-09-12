import { Router } from "express";
import { requireAdmin, requireSuperAdmin } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import { idempotent } from "../middleware/idempotency";
import * as dashboard from "../controllers/admin-dashboard.controller";
import * as operations from "../controllers/admin-operations.controller";
import * as worker from "../controllers/admin-worker.controller";
import * as customer from "../controllers/admin-customer.controller";
import * as cooperative from "../controllers/admin-cooperative.controller";
import * as ledger from "../controllers/admin-ledger.controller";
import * as service from "../controllers/admin-service.controller";
import * as notification from "../controllers/admin-notification.controller";
import * as config from "../controllers/admin-config.controller";
import * as walletOps from "../controllers/admin-wallet-ops.controller";
import * as audit from "../controllers/admin-audit.controller";
import * as demo from "../controllers/admin-demo.controller";

// Section 15 (Admin Console) + Section 15.9 (demo reset), mounted at
// /api/v1/admin alongside the Section 14 admin-payment.routes.ts router
// built in PHASE 9.
const router = Router();
router.use(requireAdmin, authenticatedRateLimit);

// 1.3.1
router.get("/dashboard/summary", dashboard.getDashboardSummary);

// 1.3.2 / 1.3.3 / 1.3.4 — literal "ledger" path registered before the
// "/:id/..." routes as defensive ordering (no 2-segment /bookings/:id
// route exists to collide with it, but this keeps the intent explicit).
router.get("/bookings/ledger", ledger.getBookingLedger);
router.get("/bookings", operations.listBookings);
router.get("/bookings/:id/dispatch-log", operations.getBookingDispatchLog);
router.get("/bookings/:id/invoice", ledger.getBookingInvoice);
router.post("/bookings/:id/force-assign", operations.forceAssignBooking);
router.post("/bookings/:id/cancel", operations.adminCancelBooking);
router.get("/dispatch/active", operations.getActiveDispatches);
router.get("/live/workers", operations.getLiveWorkers);

// 1.3.5 + Section 15.1 suspend/reactivate
router.get("/workers", worker.listWorkers);
router.patch("/workers/:id/verify", worker.verifyWorker);
router.patch("/workers/:id/skills/:skillId/verify", worker.verifyWorkerSkill);
router.patch("/workers/:id/status", worker.setWorkerSuspension);

// 1.3.6
router.get("/customers", customer.listCustomers);
router.patch("/customers/:id/status", customer.setCustomerStatus);

// 1.3.7
router.get("/cooperatives", cooperative.listCooperatives);
router.post("/cooperatives", cooperative.createCooperative);
router.get("/cooperatives/:id", cooperative.getCooperativeDetail);

// 1.3.9
router.post("/services", service.createService);
router.patch("/services/:id", service.updateService);

// 1.3.10
router.post("/notifications/broadcast", notification.broadcastNotification);
router.get("/reports/top-sectors", notification.getTopSectors);
router.get("/reports/rating-distribution", notification.getRatingDistribution);

// 1.3.11 / Section 15.6
router.get("/config", config.getConfig);
router.patch("/config", requireSuperAdmin, config.updateConfig);

// Section 15.5 / 15.7
router.post("/wallet/adjustments", idempotent("POST /admin/wallet/adjustments"), walletOps.createWalletAdjustment);
router.post("/credit-transactions/:id/reversal", walletOps.reverseCreditTransaction);
router.post("/cooperatives/:id/distribute-dividends", walletOps.distributeDividends);

// Section 15.8
router.get("/audit-logs", audit.getAuditLogs);

// Section 15.9
router.post("/demo/reset", requireSuperAdmin, demo.resetDemoData);

export default router;
