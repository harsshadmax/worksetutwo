import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken, Role } from "./jwt";
import { prisma } from "./prisma";
import { log } from "./logger";

// Standalone instance, attached to the HTTP server in app.ts.
export const io = new SocketIOServer({
  cors: {
    origin: (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
    credentials: true
  }
});

interface SocketData {
  userId: string;
  role: Role;
}

// Section 12.2 — sockets authenticate at the handshake, not after: the
// client passes the access token via the `auth` payload; an invalid,
// missing, or expired token is rejected at connect, never left connected
// unauthenticated. Same verification logic as the HTTP requireAuth
// middleware (Section 4.1/6.3/6.4) — reused, not reimplemented.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error("MISSING_TOKEN"));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new Error("INVALID_TOKEN"));
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, tokenVersion: true, accountStatus: true, deletedAt: true }
  });
  if (!user || user.deletedAt || user.tokenVersion !== payload.tokenVersion || user.accountStatus === "SUSPENDED") {
    return next(new Error("INVALID_TOKEN"));
  }

  (socket.data as SocketData) = { userId: user.id, role: user.role as Role };
  next();
});

// Section 12.3 — room membership is server-decided, never client-declared:
// there is no client-emitted "join room" event. Every authenticated
// connection joins a personal `user:{userId}` room (used by controllers to
// dynamically pull a user's live sockets into a new room, e.g. a just-
// created booking or a just-created dispatch offer — Section 12.3's
// "only for bookings they are currently offered on" is a moving target,
// not a fixed connect-time snapshot). Snapshot joins below cover bookings
// that already exist at connect time.
io.on("connection", (socket: Socket) => {
  // Phase-13 finding: an unhandled rejection here (e.g. a transient DB
  // blip in one of handleConnection's several awaits) has no global
  // handler anywhere in the app and crashes the whole process — on every
  // single socket connection, not just this room-snapshot join.
  handleConnection(socket).catch((err) => {
    log({ level: "error", message: `Socket connection handler failed: ${err instanceof Error ? err.message : String(err)}` });
  });
});

async function handleConnection(socket: Socket): Promise<void> {
  const { userId, role } = socket.data as SocketData;
  socket.join(`user:${userId}`);

  if (role === "CUSTOMER") {
    const customerProfile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!customerProfile) return;
    const activeBookings = await prisma.booking.findMany({
      where: { customerId: customerProfile.id, status: { notIn: ["SETTLED", "CANCELLED"] } },
      select: { id: true }
    });
    for (const b of activeBookings) socket.join(`booking:${b.id}`);
  } else if (role === "WORKER") {
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId } });
    if (!workerProfile) return;
    socket.join(`worker:${workerProfile.id}`);

    const [assignedBookings, offeredBookings] = await Promise.all([
      prisma.booking.findMany({
        where: { assignedWorkerId: workerProfile.id, status: { notIn: ["SETTLED", "CANCELLED"] } },
        select: { id: true }
      }),
      prisma.dispatchLog.findMany({
        where: { workerId: workerProfile.id, outcome: "OFFERED" },
        select: { bookingId: true },
        distinct: ["bookingId"]
      })
    ]);
    for (const b of assignedBookings) socket.join(`booking:${b.id}`);
    for (const d of offeredBookings) socket.join(`booking:${d.bookingId}`);
  } else if (role === "ADMIN") {
    socket.join("admin:dispatch");
    socket.join("admin:live-workers");
  }
}
