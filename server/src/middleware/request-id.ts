import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// Section 8.3 — runs first in the chain: reads X-Request-Id if the client
// supplied one, else generates a UUID; echoes it back and attaches it to
// req.id so every log line and error envelope (Section 4.8) can correlate.
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("X-Request-Id");
  req.id = incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
