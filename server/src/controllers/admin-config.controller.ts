// src/controllers/admin-config.controller.ts — Section 1.3.11, Section 15.6.
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { getOrSetCache, invalidateCache } from "../lib/cache";
import { asyncHandler, sendValidationError } from "../utils/app-error";

const CONFIG_CACHE_KEY = "platform:config";

export const getConfig = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const config = await getOrSetCache(CONFIG_CACHE_KEY, 60, async () => {
    const row = await prisma.platformConfig.findUniqueOrThrow({ where: { id: 1 } });
    return {
      commissionPercent: Number(row.commissionPercent),
      top3TimeoutSeconds: row.top3TimeoutSeconds,
      poolTimeoutSeconds: row.poolTimeoutSeconds
    };
  });
  return res.json(config);
});

const updateSchema = z.object({
  commissionPercent: z.number().min(0).max(100).optional(),
  top3TimeoutSeconds: z.number().int().positive().optional(),
  poolTimeoutSeconds: z.number().int().positive().optional()
});

// Section 15.6 — isSuper only (enforced by requireSuperAdmin on the route).
export const updateConfig = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.platformConfig.update({ where: { id: 1 }, data: parsed.data });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "PLATFORM_CONFIG_CHANGED",
      entityType: "PlatformConfig",
      entityId: "1",
      metadata: parsed.data
    });
    return row;
  });
  await invalidateCache(CONFIG_CACHE_KEY);

  return res.json({
    commissionPercent: Number(updated.commissionPercent),
    top3TimeoutSeconds: updated.top3TimeoutSeconds,
    poolTimeoutSeconds: updated.poolTimeoutSeconds
  });
});
