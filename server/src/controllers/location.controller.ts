import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis-lock";
import { io } from "../lib/socket";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";

const LOCATION_DEBOUNCE_SECONDS = 10; // Section 1.3.4
const MAX_PLAUSIBLE_SPEED_KMH = 150; // Section 9 threat #14 / Section 12.6

const pingSchema = z.object({
  lat: z.number().min(6.0).max(37.5),
  lng: z.number().min(68.0).max(97.5)
});

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const locationPing = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = pingSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { lat, lng } = parsed.data;

  const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user!.id } });
  if (!worker) {
    throw new AppError(404, "WORKER_PROFILE_NOT_FOUND", "Worker profile not found");
  }

  // Section 12.1 — location is only transmitted (and accepted) while not OFF_DUTY.
  if (worker.availabilityStatus === "OFF_DUTY") {
    throw new AppError(409, "WORKER_OFF_DUTY", "Location updates are not accepted while off duty");
  }

  // Section 9 threat #14 / 12.6 — plausibility check against the last
  // recorded position, run before the debounced write regardless of
  // whether this particular ping will end up debounced.
  const lastRows = await prisma.$queryRaw<{ lng: number | null; lat: number | null; lastLocationAt: Date | null }[]>`
    SELECT ST_X("currentLocation") AS lng, ST_Y("currentLocation") AS lat, "lastLocationAt"
    FROM worker_profiles WHERE id = ${worker.id}
  `;
  const last = lastRows[0];
  if (last?.lng !== null && last?.lng !== undefined && last?.lat !== null && last?.lat !== undefined && last?.lastLocationAt) {
    const elapsedSeconds = (Date.now() - last.lastLocationAt.getTime()) / 1000;
    if (elapsedSeconds > 0) {
      const distanceKm = haversineKm(last.lat, last.lng, lat, lng);
      const impliedSpeedKmh = distanceKm / (elapsedSeconds / 3600);
      if (impliedSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
        await prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: "LOCATION_PING_IMPLAUSIBLE",
            entityType: "WorkerProfile",
            entityId: worker.id,
            metadata: { lat, lng, impliedSpeedKmh: Math.round(impliedSpeedKmh) }
          }
        });
        throw new AppError(422, "IMPLAUSIBLE_LOCATION", "This location update implies an impossible travel speed and was rejected");
      }
    }
  }

  // Section 1.3.4 — debounce: at most one DB write + broadcast per 10s per
  // worker, regardless of how often the client pings (Section 4.10 already
  // caps that at 1/5s at the HTTP layer, ahead of this).
  const debounceKey = `loc:debounce:${worker.id}`;
  const acquired = await redis.set(debounceKey, "1", "EX", LOCATION_DEBOUNCE_SECONDS, "NX");
  if (!acquired) {
    return res.json({ accepted: true, written: false });
  }

  await prisma.$executeRaw`
    UPDATE worker_profiles
    SET "currentLocation" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), "lastLocationAt" = now()
    WHERE id = ${worker.id}
  `;

  // Section 12.4 — precise location is broadcast only to: the worker
  // themselves, the customer of their current active booking (if any, via
  // that booking's room — not a standing per-worker subscription), and
  // admin. currentBookingId is only ever non-null while ASSIGNED/
  // CONFIRMED/IN_PROGRESS (set on accept, Section 4.4.4; cleared on
  // complete/cancel), so its presence alone is sufficient — no separate
  // booking-status lookup needed.
  const payload = {
    workerId: worker.id,
    lat,
    lng,
    status: worker.availabilityStatus,
    bookingId: worker.currentBookingId,
    progressPct: null,
    alert: false,
    alertReason: null
  };
  io.to(`worker:${worker.id}`).emit("worker:location", payload);
  if (worker.currentBookingId) {
    io.to(`booking:${worker.currentBookingId}`).emit("worker:location", payload);
  }
  io.to("admin:live-workers").emit("worker:location", payload);

  return res.json({ accepted: true, written: true });
});
