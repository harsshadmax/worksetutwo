import { Router } from "express";
import { publicRateLimit } from "../middleware/rate-limit";
import { getPlatformStats, listPublicCooperatives } from "../controllers/public.controller";

const router = Router();

router.get("/stats", publicRateLimit, getPlatformStats);
router.get("/cooperatives", publicRateLimit, listPublicCooperatives);

export default router;
