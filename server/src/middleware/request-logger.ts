import { Request, Response, NextFunction } from "express";
import { log } from "../lib/logger";
import { AuthenticatedRequest } from "./auth";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    log({
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      requestId: req.id,
      route: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
      status: res.statusCode,
      latencyMs: Date.now() - start,
      userId: (req as AuthenticatedRequest).user?.id,
      errorCode: res.locals.errorCode as string | undefined
    });
  });
  next();
}
