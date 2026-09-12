import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/app-error";
import { getOrSetCache } from "../lib/cache";

// Section 1.1.3 — Redis-cached, invalidated on admin write (PHASE 11's
// PATCH /admin/services will call invalidateCache("services:catalog:all")
// from ../lib/cache). Deviation, flagged: Section 1.1.3's key pattern is
// services:catalog:{lang}, but this endpoint's response shape carries only
// translationKey (a lookup key the frontend localizes client-side via
// translations.js), never already-localized text — the data is identical
// for every language, so a single unparameterized key is used instead of
// fragmenting the cache across four languages of the same content.
export const listServices = asyncHandler(async (_req: Request, res: Response) => {
  const services = await getOrSetCache("services:catalog:all", 300, async () => {
    const rows = await prisma.serviceCategory.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" }
    });
    return rows.map((s) => ({
      id: s.id,
      translationKey: s.translationKey,
      baseRate: Number(s.baseRate),
      hourlyRate: Number(s.hourlyRate),
      icon: s.icon,
      isEnabled: s.isEnabled
    }));
  });
  return res.json(services);
});
