import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { log } from "../lib/logger";

// Section 4.8 error envelope.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function isBodyParseError(err: unknown): boolean {
  // express.json() throws a SyntaxError with these markers before any
  // route handler (and its Zod schema) ever runs — a malformed JSON body
  // is a client input problem (400), not a server fault (500).
  return (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status?: number }).status === 400 &&
    "type" in err &&
    (err as { type?: string }).type === "entity.parse.failed"
  );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.locals.errorCode = err.code;
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, requestId: req.id } });
  }
  if (isBodyParseError(err)) {
    res.locals.errorCode = "VALIDATION_FAILED";
    return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Malformed request body", requestId: req.id } });
  }
  // Section 8.5 — never leak a raw stack trace, DB error, or file path to
  // the client; the real error is logged server-side, correlated by requestId.
  res.locals.errorCode = "INTERNAL_ERROR";
  log({ level: "error", requestId: req.id, message: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId: req.id } });
}

export function notFoundHandler(req: Request, res: Response) {
  res.locals.errorCode = "ROUTE_NOT_FOUND";
  return res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: "The requested route does not exist", requestId: req.id } });
}

// Section 8.1 — the response carries only the first failing field's
// message; Zod's full `error.flatten()` is logged server-side with the
// requestId, never returned to the client.
export function sendValidationError(req: Request, res: Response, zodError: ZodError) {
  res.locals.errorCode = "VALIDATION_FAILED";
  log({ level: "warn", requestId: req.id, errorCode: "VALIDATION_FAILED", details: zodError.flatten() });
  const message = zodError.issues[0]?.message ?? "Invalid request";
  return res.status(400).json({ error: { code: "VALIDATION_FAILED", message, requestId: req.id } });
}
