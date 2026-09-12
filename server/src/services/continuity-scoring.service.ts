// src/services/continuity-scoring.service.ts
import { prisma } from "../lib/prisma";

export interface CandidateWorker {
  workerId: string;
  distanceKm: number;
  ratingAverage: number;
  priorJobsWithCustomer: number;
  continuityScore: number;
}

// Section 4.12 item 2 correction: the radius bound is LEAST(worker's own
// serviceAreaRadiusKm, platform ceiling) — not the flat global constant the
// original Section 4.4.1 listing used, which ignored the per-worker column
// the schema exists specifically to honor. Applied to both the ST_DWithin
// eligibility filter and the continuityScore proximity term.
//
// Section 12.6 (PHASE 8) — the lastLocationAt recency filter below excludes
// stale-location workers from candidate scoring rather than offering them
// a job they can no longer be accurately routed to, exactly as Section
// 12.6 specifies should be "added to Section 4.4.1's WHERE clause during
// implementation."
export async function scoreCandidateWorkers(params: {
  serviceCategoryId: string;
  customerId: string;
  lng: number;
  lat: number;
  maxRadiusKm: number;
}): Promise<CandidateWorker[]> {
  const { serviceCategoryId, customerId, lng, lat, maxRadiusKm } = params;

  const rows = await prisma.$queryRaw<CandidateWorker[]>`
    SELECT
      wp.id AS "workerId",
      ST_Distance(
        wp."currentLocation"::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) / 1000.0 AS "distanceKm",
      wp."ratingAverage" AS "ratingAverage",
      COALESCE(prior.job_count, 0)::int AS "priorJobsWithCustomer",
      (
        (COALESCE(prior.job_count, 0) * 40.0) +
        (wp."ratingAverage" * 12.0) +
        (GREATEST(0, LEAST(wp."serviceAreaRadiusKm", ${maxRadiusKm}::float) - (ST_Distance(
          wp."currentLocation"::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) / 1000.0)) * 6.0)
      ) AS "continuityScore"
    FROM worker_profiles wp
    INNER JOIN worker_skills ws ON ws."workerProfileId" = wp.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS job_count
      FROM bookings b
      INNER JOIN customer_profiles cp ON cp.id = b."customerId"
      WHERE b."assignedWorkerId" = wp.id
        AND cp.id = ${customerId}
        AND b.status IN ('COMPLETED', 'SETTLED')
    ) prior ON true
    WHERE ws."skillCategoryId" = ${serviceCategoryId}
      AND ws."verificationStatus" = 'APPROVED'
      AND wp."verificationStatus" = 'APPROVED'
      AND wp."availabilityStatus" = 'AVAILABLE'
      AND wp."currentLocation" IS NOT NULL
      AND wp."lastLocationAt" > now() - interval '120 seconds'
      AND ST_DWithin(
        wp."currentLocation"::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        LEAST(wp."serviceAreaRadiusKm", ${maxRadiusKm}::float) * 1000
      )
    ORDER BY "continuityScore" DESC
    LIMIT 20
  `;

  return rows;
}
