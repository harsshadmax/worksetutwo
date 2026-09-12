import { Response, NextFunction } from "express";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "./auth";
import { AppError } from "../utils/app-error";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000; // Section 3 — retained 24h

function hashRequestBody(body: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

// Section 4.9 — absence of the header is not an error; the request just
// proceeds without replay protection. Scoped per (userId, route, key), so
// this only applies to already-authenticated routes (requireAuth must run
// before this middleware).
export function idempotent(routeName: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const rawKey = req.header(IDEMPOTENCY_KEY_HEADER);
    if (!rawKey) {
      next();
      return;
    }
    if (!req.user) {
      next(new AppError(401, "MISSING_TOKEN", "Authentication required"));
      return;
    }

    const userId = req.user.id;
    const requestHash = hashRequestBody(req.body);

    void (async () => {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { userId_route_key: { userId, route: routeName, key: rawKey } }
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          next(new AppError(409, "IDEMPOTENCY_KEY_REUSE", "This idempotency key was already used with a different request"));
          return;
        }
        if (existing.status === "COMPLETED" && existing.responseCode !== null && existing.responseBody !== null) {
          res.status(existing.responseCode).json(existing.responseBody);
          return;
        }
        // Still IN_PROGRESS — a concurrent duplicate, not a completed replay.
        next(new AppError(409, "IDEMPOTENCY_KEY_IN_PROGRESS", "This request is already being processed"));
        return;
      }

      try {
        await prisma.idempotencyKey.create({
          data: {
            userId,
            route: routeName,
            key: rawKey,
            requestHash,
            status: "IN_PROGRESS",
            expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS)
          }
        });
      } catch {
        // Unique-constraint race: a concurrent request with the same key won.
        next(new AppError(409, "IDEMPOTENCY_KEY_IN_PROGRESS", "This request is already being processed"));
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        prisma.idempotencyKey
          .update({
            where: { userId_route_key: { userId, route: routeName, key: rawKey } },
            data: {
              status: "COMPLETED",
              responseCode: res.statusCode,
              responseBody: body === undefined ? Prisma.JsonNull : (body as Prisma.InputJsonValue)
            }
          })
          .catch((err) => console.error("Failed to persist idempotency response", err));
        return originalJson(body);
      }) as typeof res.json;

      next();
    })().catch(next);
  };
}
