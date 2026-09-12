import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import { getCooperative } from "../controllers/cooperative.controller";

const router = Router();

router.get("/:id", requireAuth("CUSTOMER", "WORKER"), authenticatedRateLimit, getCooperative);

export default router;
