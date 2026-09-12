// src/controllers/admin-demo.controller.ts — Section 15.9.
import { Response } from "express";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError } from "../utils/app-error";
import { log } from "../lib/logger";

const execFileAsync = promisify(execFile);
const SERVER_ROOT = path.join(__dirname, "..", "..");

// Section 15.9 — isSuper only (enforced by requireSuperAdmin on the route).
// Invokes `npx ts-node prisma/seed.ts` — the exact same command every prior
// phase's verification already ran (Section 19.3, 21.5), PHASE 10's retry
// resilience included — rather than re-implementing the seed logic
// in-process. A direct TS import was tried first but prisma/seed.ts lives
// outside tsconfig's `rootDir: "src"`, so `tsc --noEmit`/`npm run build`
// would fail on the cross-boundary import; shelling out avoids that and
// also keeps the reseed in its own process/connection, isolated from the
// app's own request-handling event loop for the multi-minute duration
// this can take against this environment's Supabase pooler latency
// (Section 29's documented characteristic).
//
// Deviation, disclosed: the spec says this runs "inside a transaction" —
// impractical for a many-statement, multi-minute operation (would risk
// lock contention/timeouts and defeat seed.ts's own retry resilience,
// which assumes a fresh idempotent run per attempt, not a nested
// transaction). The AuditLog row is written after the reseed completes,
// with actorId: null — the reseed deletes and recreates every User row,
// including the calling admin's own, so req.user.id no longer references
// a real row by the time this write happens (real accounts created during
// a demo session are demo data too, per this section's own text, and are
// wiped along with everything else).
export const resetDemoData = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await execFileAsync("npx", ["ts-node", "prisma/seed.ts"], { cwd: SERVER_ROOT, shell: true, timeout: 15 * 60 * 1000 });
  } catch (err) {
    log({ level: "error", message: `Demo data reset failed: ${err instanceof Error ? err.message : String(err)}` });
    throw new AppError(500, "DEMO_RESET_FAILED", "Demo data reset failed — see server logs");
  }

  await prisma.auditLog.create({
    data: { actorId: null, action: "DEMO_DATA_RESET", entityType: "System", entityId: "demo-reset" }
  });

  return res.json({
    reset: true,
    demoCredentials: {
      admin: { email: "registrar@worksetu.coop", password: "AdminPass@123" },
      customer: { email: "deepika@example.com", password: "Customer@123" },
      worker: { email: "ravi.kumar@example.com", password: "Worker@123" }
    }
  });
});
