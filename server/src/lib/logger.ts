// Section 22.4 structured log shape, built alongside request-id (Section
// 8.3) since requestId is the log line's primary correlation key. Never
// includes request bodies, passwords, or tokens (Section 8.6) — only
// route/status/latency/requestId/userId/errorCode.
interface LogFields {
  level: "debug" | "info" | "warn" | "error";
  requestId?: string;
  route?: string;
  status?: number;
  latencyMs?: number;
  userId?: string;
  errorCode?: string;
  message?: string;
  details?: unknown;
}

export function log(fields: LogFields): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...fields });
  if (fields.level === "error") console.error(line);
  else if (fields.level === "warn") console.warn(line);
  else console.log(line);
}
