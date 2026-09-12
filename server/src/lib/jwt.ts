import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type Role = "CUSTOMER" | "WORKER" | "ADMIN";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  tokenVersion: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload & { iat: number; exp: number } {
  // Explicit algorithm allowlist (Section 9 threat #9) — never trust the
  // token's own `alg` header.
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AccessTokenPayload & { iat: number; exp: number };
}
