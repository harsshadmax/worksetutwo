import { Router } from "express";
import { requireCustomer, requireProvider } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import { idempotent } from "../middleware/idempotency";
import { getDispatchCandidates, respondToDispatch } from "../controllers/dispatch.controller";

const router = Router();

router.get("/:bookingId/candidates", requireCustomer, authenticatedRateLimit, getDispatchCandidates);
router.post(
  "/:dispatchLogId/respond",
  requireProvider,
  authenticatedRateLimit,
  idempotent("POST /dispatch/:dispatchLogId/respond"),
  respondToDispatch
);

export default router;
