// src/controllers/document-signed.controller.ts — Section 16.5's serving
// side. Public route (no JWT): a real cloud signed URL carries its own
// bearer proof in the query string rather than an Authorization header,
// and this endpoint mirrors that — verifySignedObjectKey is the actual
// gate, not requireAuth.
import { Request, Response } from "express";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { verifySignedObjectKey, resolveObjectPath } from "../services/storage/local-disk.adapter";
import { asyncHandler, AppError } from "../utils/app-error";

export const serveSignedDocument = asyncHandler(async (req: Request, res: Response) => {
  const objectKey = req.params.objectKey;
  const expires = Number(req.query.expires);
  const sig = typeof req.query.sig === "string" ? req.query.sig : "";

  if (!objectKey || !Number.isFinite(expires) || !sig || !verifySignedObjectKey(objectKey, expires, sig)) {
    throw new AppError(401, "SIGNED_URL_INVALID_OR_EXPIRED", "This signed URL is invalid or has expired");
  }

  // Defense in depth — re-check the document's current state even though
  // the URL's signature is valid, in case it was deleted or flagged
  // infected after the URL was issued but before it was used.
  const document = await prisma.document.findUnique({ where: { storageKey: objectKey } });
  if (!document || document.deletedAt || document.scanStatus !== "CLEAN") {
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  }

  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(resolveObjectPath(objectKey)).pipe(res);
});
