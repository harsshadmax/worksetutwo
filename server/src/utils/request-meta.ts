import { Request } from "express";

export function requestMeta(req: Request): { ipAddress?: string; userAgent?: string } {
  const ua = req.headers["user-agent"];
  return {
    ipAddress: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua
  };
}
