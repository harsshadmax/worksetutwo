import { z } from "zod";

// Section 3.3 rule 5 / 8.4 — every list endpoint accepts page (default 1)
// and pageSize (default 20, max 100 — clamped, not rejected). No list
// endpoints exist yet (PHASE 5 onward); this is the shared schema they'll
// all import.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number, totalCount: number): PaginatedResult<T> {
  return { items, page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) };
}
