import "dotenv/config"; // must be first — every other module reads process.env at load time
import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import workerRoutes from "./routes/worker.routes";
import publicRoutes from "./routes/public.routes";
import serviceRoutes from "./routes/service.routes";
import cooperativeRoutes from "./routes/cooperative.routes";
import userRoutes from "./routes/user.routes";
import notificationRoutes from "./routes/notification.routes";
import bookingRoutes from "./routes/booking.routes";
import dispatchRoutes from "./routes/dispatch.routes";
import customerRoutes from "./routes/customer.routes";
import adminPaymentRoutes from "./routes/admin-payment.routes";
import adminRoutes from "./routes/admin.routes";
import documentRoutes from "./routes/document.routes";
import documentSignedRoutes from "./routes/document-signed.routes";
import healthRoutes from "./routes/health.routes";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler, notFoundHandler } from "./utils/app-error";
import { io } from "./lib/socket";
import { startReconciliationSweep } from "./services/dispatch-reconciliation.service";

const app = express();

// Section 8.3 — first in the chain, so every response (including ones
// rejected by later middleware) carries X-Request-Id and every log line
// can be correlated to it.
app.use(requestId);
app.use(requestLogger);

// Section 8.3 — HSTS, X-Content-Type-Options, X-Frame-Options DENY, a
// restrictive default-src CSP (appropriate for a JSON API), and removes
// X-Powered-By — all helmet defaults, matching the requirement as-is.
app.use(helmet());

// Section 8.2 — explicit origin allowlist, never a wildcard; credentials
// enabled only because the refresh-token cookie (Section 6.1) needs it.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: "1mb" })); // Section 8.4
app.use(cookieParser());

app.use(healthRoutes);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workers", workerRoutes);
app.use("/api/v1/public", publicRoutes);
app.use("/api/v1/services", serviceRoutes);
app.use("/api/v1/cooperatives", cooperativeRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/dispatch", dispatchRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/admin", adminPaymentRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/workers", documentRoutes);
app.use("/api/v1/documents", documentSignedRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;

// Socket.io needs a raw http.Server to attach to, not just the Express
// app — the plain app.listen() used through PHASE 5 no longer suffices
// now that the dispatch engine (Section 4.4.3/4.4.4) emits real events.
const httpServer = http.createServer(app);
io.attach(httpServer);

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`Worksetu API listening on port ${PORT}`);
  });
  startReconciliationSweep(); // Section 11.4
}

export default app;
