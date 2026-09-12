import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAnyRole } from "../middleware/auth";
import { loginRateLimit, registerRateLimit, publicRateLimit, authenticatedRateLimit } from "../middleware/rate-limit";

const router = Router();

router.post("/customer/register", registerRateLimit, authController.registerCustomer);
router.post("/customer/login", loginRateLimit, authController.loginCustomer);
router.post("/worker/register", registerRateLimit, authController.registerWorker);
router.post("/worker/login", loginRateLimit, authController.loginWorker);
// No POST /auth/admin/register — Section 7.4: admin accounts are
// provisioned only by direct DB seed/migration, never a public endpoint.
router.post("/admin/login", loginRateLimit, authController.loginAdmin);

router.post("/refresh", publicRateLimit, authController.refresh);
router.post("/logout", requireAnyRole, authenticatedRateLimit, authController.logout);
router.post("/logout-all", requireAnyRole, authenticatedRateLimit, authController.logoutAll);

router.post("/password-reset/request", publicRateLimit, authController.passwordResetRequest);
router.post("/password-reset/confirm", publicRateLimit, authController.passwordResetConfirm);
router.post("/verify-otp", requireAnyRole, authenticatedRateLimit, authController.verifyOtp);

export default router;
