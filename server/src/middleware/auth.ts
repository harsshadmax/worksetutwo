import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { verifyAccessToken, Role } from "../lib/jwt";
import { AppError, asyncHandler } from "../utils/app-error";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: Role };
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

// Section 4.1 base guard, extended per Section 27's worked example and
// Section 6.3/6.4: a structurally valid, unexpired, correctly-signed token
// is still rejected if its tokenVersion has been superseded (revoked
// session) or its owner has been suspended/soft-deleted since issuance.
// Phase-13 finding: this is an async Express middleware (Express 4, no
// built-in promise-rejection handling) that runs on every authenticated
// request and, unguarded, called prisma.user.findUnique() directly. A
// transient DB error there (this environment's Supabase pooler is known
// to drop connections intermittently, P1001) became an unhandled promise
// rejection with no global handler anywhere in the app — crashing the
// entire process on the single hottest path in the whole API, confirmed
// live: the integration test server went down mid-suite with exactly
// this stack trace and never recovered. asyncHandler forwards the error
// to the normal error-handling chain (a standard 500 envelope, Section
// 8.5) instead.
export function requireAuth(...allowedRoles: Role[]) {
  return asyncHandler(async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return next(new AppError(401, "MISSING_TOKEN", "Authentication required"));
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err instanceof Error && err.name === "TokenExpiredError") {
        return next(new AppError(401, "TOKEN_EXPIRED", "Session expired, please log in again"));
      }
      return next(new AppError(401, "INVALID_TOKEN", "Invalid authentication token"));
    }

    if (!allowedRoles.includes(payload.role)) {
      return next(new AppError(403, "FORBIDDEN_ROLE", "You do not have permission to access this resource"));
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, tokenVersion: true, accountStatus: true, deletedAt: true }
    });
    if (!user || user.deletedAt) {
      return next(new AppError(401, "INVALID_TOKEN", "Invalid authentication token"));
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      return next(new AppError(401, "TOKEN_REVOKED", "Session has been revoked, please log in again"));
    }
    if (user.accountStatus === "SUSPENDED") {
      return next(new AppError(403, "ACCOUNT_SUSPENDED", "This account has been suspended"));
    }

    req.user = { id: user.id, role: user.role as Role };
    next();
  });
}

export const requireCustomer = requireAuth("CUSTOMER");
export const requireProvider = requireAuth("WORKER");
export const requireAdmin = requireAuth("ADMIN");
export const requireProviderOrAdmin = requireAuth("WORKER", "ADMIN");
export const requireAnyRole = requireAuth("CUSTOMER", "WORKER", "ADMIN");

// Section 15.6 — the single most sensitive action in the system
// (PATCH /admin/config) additionally requires AdminProfile.isSuper = true.
// Mounted after requireAdmin, so req.user is already populated and role-checked.
export const requireSuperAdmin = asyncHandler(async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const adminProfile = await prisma.adminProfile.findUnique({ where: { userId: req.user!.id } });
  if (!adminProfile?.isSuper) {
    return next(new AppError(403, "SUPER_ADMIN_REQUIRED", "This action requires super-admin privileges"));
  }
  next();
});
