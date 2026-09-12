import { Router } from "express";
import { requireProvider } from "../middleware/auth";
import { authenticatedRateLimit, locationPingRateLimit, walletRedeemRateLimit } from "../middleware/rate-limit";
import { idempotent } from "../middleware/idempotency";
import * as workerController from "../controllers/worker.controller";
import { getIncomingOffers, getMyWorkerBookings } from "../controllers/booking.controller";
import { locationPing } from "../controllers/location.controller";
import { getWallet, redeemWallet } from "../controllers/wallet.controller";

const router = Router();

// Not one of Section 4.9's six named routes, but the same idempotency
// middleware applies cleanly to any authenticated mutation — first
// demonstrated here in PHASE 4, ahead of PHASE 6 wiring it onto two of
// the real six routes below (POST /bookings/request, POST /dispatch/respond).
router.patch(
  "/me/availability",
  requireProvider,
  authenticatedRateLimit,
  idempotent("PATCH /workers/me/availability"),
  workerController.updateAvailability
);

router.get("/me/demand-heatmap", requireProvider, authenticatedRateLimit, workerController.getDemandHeatmap);
router.get("/me/welfare", requireProvider, authenticatedRateLimit, workerController.getWelfare);
router.get("/me/incentives", requireProvider, authenticatedRateLimit, workerController.getIncentives);
router.get("/me/incoming", requireProvider, authenticatedRateLimit, getIncomingOffers);
router.get("/me/bookings", requireProvider, authenticatedRateLimit, getMyWorkerBookings);

// Section 4.2's literal path — POST /api/v1/workers/location-ping, not
// under /me/ like the routes above.
router.post("/location-ping", requireProvider, locationPingRateLimit, locationPing);

router.get("/me/wallet", requireProvider, authenticatedRateLimit, getWallet);
router.post(
  "/me/wallet/redeem",
  requireProvider,
  walletRedeemRateLimit,
  idempotent("POST /workers/me/wallet/redeem"),
  redeemWallet
);

export default router;
