import { Router } from "express";
import { requireProvider, requireProviderOrAdmin } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import * as documentController from "../controllers/document.controller";

// Mounted at /api/v1/workers alongside worker.routes.ts (Section 16).
const router = Router();

router.post(
  "/documents",
  requireProvider,
  authenticatedRateLimit,
  documentController.uploadMiddleware,
  documentController.uploadDocument
);
router.get("/documents/:id/signed-url", requireProviderOrAdmin, authenticatedRateLimit, documentController.getSignedUrl);
router.delete("/documents/:id", requireProvider, authenticatedRateLimit, documentController.deleteDocument);

export default router;
