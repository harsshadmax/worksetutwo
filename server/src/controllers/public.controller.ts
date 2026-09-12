import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/app-error";
import { getOrSetCache } from "../lib/cache";

// Section 1.1.1 — Redis-cached, key stats:platform, TTL 300s.
export const getPlatformStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await getOrSetCache("stats:platform", 300, async () => {
    const [totalWorkers, completedBookings, activeCooperatives] = await Promise.all([
      prisma.user.count({ where: { role: "WORKER", deletedAt: null } }),
      prisma.booking.count({ where: { status: "SETTLED" } }),
      prisma.cooperative.count()
    ]);
    return { totalWorkers, completedBookings, activeCooperatives };
  });
  return res.json(stats);
});

// New endpoint, added in PHASE 12 — the worker registration form's
// cooperative dropdown (Section 1.2.1) needs a list of cooperatives to
// choose from before the applicant has an account, but Section 4.2 only
// ever specified GET /cooperatives/:id (JWT Customer/Provider, single) and
// GET /admin/cooperatives (JWT Admin, list) — no unauthenticated list
// route existed. This mirrors the existing GET /public/stats "Public"
// pattern and returns only the fields already exposed by the authenticated
// single-cooperative endpoint (never registrationNumber, which is
// admin-only per Section 1.3.7).
export const listPublicCooperatives = asyncHandler(async (_req: Request, res: Response) => {
  const cooperatives = await getOrSetCache("cooperatives:public:all", 300, async () => {
    const rows = await prisma.cooperative.findMany({ orderBy: { name: "asc" } });
    return rows.map((c) => ({ id: c.id, name: c.name, location: c.location, members: c.members, founded: c.founded }));
  });
  return res.json(cooperatives);
});
