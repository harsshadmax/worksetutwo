import { Router } from "express";
import { requireCustomer } from "../middleware/auth";
import { authenticatedRateLimit } from "../middleware/rate-limit";
import { listMyBookings } from "../controllers/booking.controller";

const router = Router();

router.get("/me/bookings", requireCustomer, authenticatedRateLimit, listMyBookings);

export default router;
