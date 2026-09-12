import { Router } from "express";
import { publicRateLimit } from "../middleware/rate-limit";
import { listServices } from "../controllers/service.controller";

const router = Router();

router.get("/", publicRateLimit, listServices);

export default router;
