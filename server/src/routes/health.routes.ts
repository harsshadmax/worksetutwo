// src/routes/health.routes.ts — Section 22.1.
//
// Built here, ahead of PHASE 14 (Section 21/22, CI/CD and Deployment)
// where Section 22 otherwise belongs, because Section 20.5's own
// "Database unavailable" failure-recovery row (PHASE 13's own spec)
// explicitly requires testing against GET /ready's 503 behavior. Minimal
// surface only: the three endpoints Section 22.1 names, nothing from
// 22.2/22.3 (both explicitly OUT/P2 for this prototype pass).
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis-lock";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

router.get("/ready", async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`, 2000)
      .then(() => true)
      .catch(() => false),
    withTimeout(redis.ping(), 2000)
      .then(() => true)
      .catch(() => false)
  ]);

  if (dbOk && redisOk) {
    return res.status(200).json({ status: "ready", db: true, redis: true });
  }
  return res.status(503).json({ status: "not ready", db: dbOk, redis: redisOk });
});

export default router;
