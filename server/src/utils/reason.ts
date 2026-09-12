import { AppError } from "./app-error";

// Section 4.11 — "every route tagged with a required metadata.reason ...
// rejects the request with 400 REASON_REQUIRED if the field is absent."
// Shared across every Section 15.1 admin action whose "Reason required"
// column is "Yes", instead of re-deriving this check per controller.
export function requireNonEmptyReason(body: unknown): string {
  const reason = (body as { reason?: unknown } | null | undefined)?.reason;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new AppError(400, "REASON_REQUIRED", "A reason is required for this action");
  }
  return reason.trim();
}
