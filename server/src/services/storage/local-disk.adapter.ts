import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { StorageAdapter } from "./types";

// Section 16.4 — "private, no public read policy, no code path that serves
// a document via a permanent public URL." This directory lives outside
// `dist/` and is never mounted as a static file root (app.ts has no
// `express.static` pointed at it) — the only way to read a file back out
// is through createSignedUrl's time-limited, signature-verified token,
// served by the dedicated route in document.routes.ts.
const STORAGE_ROOT = path.join(__dirname, "..", "..", "..", "storage-private");

// Reuses JWT_SECRET rather than introducing a second signing secret into
// .env — both are server-only HMAC/signing keys with the same blast-radius
// if leaked, and Section 16.5 doesn't call for a distinct key.
const SIGNING_SECRET = process.env.JWT_SECRET ?? "dev-placeholder-secret";

function sign(objectKey: string, expiresAt: number): string {
  return crypto.createHmac("sha256", SIGNING_SECRET).update(`${objectKey}:${expiresAt}`).digest("hex");
}

export function verifySignedObjectKey(objectKey: string, expiresAt: number, signature: string): boolean {
  if (Date.now() > expiresAt) return false;
  const expected = sign(objectKey, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function resolveObjectPath(objectKey: string): string {
  // objectKey is always a server-generated `${uuid}.${ext}` (Section
  // 16.3) — never derived from user input — so this join can never escape
  // STORAGE_ROOT via path traversal.
  return path.join(STORAGE_ROOT, objectKey);
}

class LocalDiskStorageAdapter implements StorageAdapter {
  async save(objectKey: string, data: Buffer): Promise<void> {
    await fs.mkdir(STORAGE_ROOT, { recursive: true });
    await fs.writeFile(resolveObjectPath(objectKey), data);
  }

  // Section 16.5 — 5-minute expiry, re-requested fresh on every view; the
  // token is verified by verifySignedObjectKey in the serving route rather
  // than by any session/JWT check, mirroring how a real cloud signed URL
  // carries its own bearer proof instead of an Authorization header.
  async createSignedUrl(objectKey: string, expirySeconds: number): Promise<string> {
    const expiresAt = Date.now() + expirySeconds * 1000;
    const signature = sign(objectKey, expiresAt);
    return `/api/v1/documents/signed/${objectKey}?expires=${expiresAt}&sig=${signature}`;
  }

  async delete(objectKey: string): Promise<void> {
    await fs.rm(resolveObjectPath(objectKey), { force: true });
  }
}

export const storageAdapter: StorageAdapter = new LocalDiskStorageAdapter();
