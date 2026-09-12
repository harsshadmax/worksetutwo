import { Router } from "express";
import { serveSignedDocument } from "../controllers/document-signed.controller";

// Mounted at /api/v1/documents. Public — see document-signed.controller.ts.
const router = Router();

router.get("/signed/:objectKey", serveSignedDocument);

export default router;
