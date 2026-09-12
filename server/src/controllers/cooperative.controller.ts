import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError } from "../utils/app-error";

// Section 1.2.8/1.3.7 — no per-resource ownership concept (any authenticated
// customer/worker may view any cooperative's public profile), so the
// Section 7.3 "404 not 403" ownership pattern doesn't apply here; a
// genuinely missing id is the only not-found case.
export const getCooperative = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const cooperative = await prisma.cooperative.findUnique({ where: { id: req.params.id } });
  if (!cooperative) {
    throw new AppError(404, "COOPERATIVE_NOT_FOUND", "Cooperative not found");
  }
  return res.json({
    id: cooperative.id,
    name: cooperative.name,
    location: cooperative.location,
    members: cooperative.members,
    founded: cooperative.founded
  });
});
