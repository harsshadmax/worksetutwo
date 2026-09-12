import { Router } from "express";
import { requireAnyRole } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import { getProfile, updateProfile, updatePreferences } from "../controllers/user.controller";

const router = Router();

router.get("/me", requireAnyRole, authenticatedRateLimit, getProfile);
router.patch("/me", requireAnyRole, authenticatedRateLimit, updateProfile);
router.patch("/me/preferences", requireAnyRole, authenticatedRateLimit, updatePreferences);

export default router;
