// src/controllers/document.controller.ts — Section 16, Section 9 threat #8.
import { Response, NextFunction, Request } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { storageAdapter } from "../services/storage/local-disk.adapter";
import { malwareScanner } from "../services/malware-scanner/stub-scanner";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { log } from "../lib/logger";
import { dispatchNotification } from "../services/notification-dispatcher.service";

// Section 16.2 — 10MB per file, image/jpeg | image/png | application/pdf only.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS_PER_TYPE = 5;

const multerSingle = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } }).single("file");

// Section 16.2 — "an oversized file is rejected with 400 before upload
// proceeds to storage." multer's own limit rejection surfaces as a
// MulterError, which isn't an AppError and would otherwise fall through
// errorHandler's generic 500 path instead of the documented 400.
export function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  multerSingle(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(400, "FILE_TOO_LARGE", "File exceeds the 10MB size limit"));
    }
    if (err) return next(err);
    next();
  });
}

// Section 16.7 — the browser-supplied Content-Type is advisory only; the
// server determines the real type by content-sniffing the first bytes
// (magic-number check). A hand-rolled check over exactly the three
// allowed types stands in for the PRD's illustrative `file-type` package:
// that package's modern majors are ESM-only and would conflict with this
// project's CommonJS/ts-node setup (Section 0.3 established elsewhere —
// no new source dependency risk for a 3-signature check), and the
// security property (server-side sniff, never trust the client header)
// is identical either way.
function sniffMimeType(buffer: Buffer): "image/jpeg" | "image/png" | "application/pdf" | null {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return "image/png";
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf"
};

const uploadBodySchema = z.object({
  documentType: z.enum(["IDENTITY_PROOF", "CERTIFICATION", "COOPERATIVE_ID"])
});

export const uploadDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
  if (!file) {
    throw new AppError(400, "VALIDATION_FAILED", "A file is required");
  }
  const parsed = uploadBodySchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { documentType } = parsed.data;

  const sniffedType = sniffMimeType(file.buffer);
  if (!sniffedType) {
    throw new AppError(400, "INVALID_FILE_TYPE", "Only JPEG, PNG, and PDF files are accepted");
  }
  // Section 16.7 — a file claiming image/png whose bytes don't match is
  // rejected as a MIME mismatch, independent of and prior to the malware scan.
  if (file.mimetype !== sniffedType) {
    throw new AppError(400, "MIME_MISMATCH", "Declared file type does not match file content");
  }

  const existingCount = await prisma.document.count({
    where: { ownerUserId: req.user!.id, documentType, deletedAt: null }
  });
  if (existingCount >= MAX_DOCUMENTS_PER_TYPE) {
    throw new AppError(400, "TOO_MANY_DOCUMENTS", `Maximum ${MAX_DOCUMENTS_PER_TYPE} documents per type already uploaded`);
  }

  // Section 16.3 — server-generated random key, never derived from the
  // client-supplied filename; originalFilename is stored as display
  // metadata only and never touches the storage path.
  const storageKey = `${randomUUID()}.${EXTENSION_BY_MIME[sniffedType]}`;
  await storageAdapter.save(storageKey, file.buffer);

  const document = await prisma.document.create({
    data: {
      ownerUserId: req.user!.id,
      documentType,
      storageKey,
      originalFilename: file.originalname,
      mimeType: sniffedType,
      sizeBytes: file.size,
      scanStatus: "PENDING"
    }
  });

  // Section 16.6 — async scan gate: quarantined (scanStatus PENDING) until
  // this resolves. Fire-and-forget so the upload response isn't held open
  // for the scan (the stub resolves instantly here, but a real scanner
  // would not).
  runMalwareScan(document.id, storageKey).catch((err) => log({ level: "error", message: `Malware scan failed: ${err}` }));

  return res.status(202).json({ documentId: document.id, scanStatus: "PENDING" });
});

async function runMalwareScan(documentId: string, storageKey: string): Promise<void> {
  const outcome = await malwareScanner.scan(storageKey);
  if (outcome === "INFECTED") {
    await storageAdapter.delete(storageKey);
    await prisma.document.update({ where: { id: documentId }, data: { scanStatus: "INFECTED" } });
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (doc) {
      await dispatchNotification({
        userId: doc.ownerUserId,
        title: "Upload rejected",
        body: "Your uploaded document failed a security scan and was removed. Please upload a different file."
      });
    }
    return;
  }
  if (outcome === "SCAN_FAILED") {
    // Section 16.6 — stays quarantined, never served, never counted as a
    // valid submitted document; an admin alert fires (no real alerting
    // channel exists in this prototype, so this is a server-side log,
    // matching Section 18's stub-channel precedent for out-of-scope
    // real-world integrations).
    await prisma.document.update({ where: { id: documentId }, data: { scanStatus: "SCAN_FAILED" } });
    log({ level: "error", message: `Document ${documentId} malware scan failed — admin review required` });
    return;
  }
  await prisma.document.update({ where: { id: documentId }, data: { scanStatus: "CLEAN" } });
}

// Section 16.5 — JWT Provider (own documents only) or JWT Admin (any
// worker's, for verification review). Section 7.3's 404-not-403 pattern.
export const getSignedUrl = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  const isOwner = document?.ownerUserId === req.user!.id;
  if (!document || document.deletedAt || (!isOwner && req.user!.role !== "ADMIN")) {
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  }
  // Section 16.6 — "no document with scanStatus other than CLEAN is ever
  // returned by the signed-url endpoint."
  if (document.scanStatus !== "CLEAN") {
    throw new AppError(409, "SCAN_NOT_CLEAN", "This document has not passed its security scan yet");
  }

  const signedUrl = await storageAdapter.createSignedUrl(document.storageKey, 5 * 60);
  return res.json({ signedUrl, expiresInSeconds: 300 });
});

// Section 16.8 — own documents only; new endpoint.
export const deleteDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document || document.deletedAt || document.ownerUserId !== req.user!.id) {
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  }

  // Section 16.8 — reject if this is the sole evidence backing a currently
  // APPROVED verification. Interpreted as: any Certification referencing
  // this document whose parent WorkerSkill is currently APPROVED.
  const backingApprovedCertification = await prisma.certification.findFirst({
    where: { documentId: document.id, workerSkill: { verificationStatus: "APPROVED" } }
  });
  if (backingApprovedCertification) {
    throw new AppError(409, "DOCUMENT_IN_USE", "This document backs an approved verification and cannot be deleted");
  }

  await storageAdapter.delete(document.storageKey);
  await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });

  return res.json({ documentId: document.id, deleted: true });
});
