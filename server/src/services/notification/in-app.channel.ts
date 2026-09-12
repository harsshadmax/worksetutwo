import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { io } from "../../lib/socket";
import { NotificationChannel, NotificationPayload } from "./types";

// Section 18.1 — the only channel wired to a real backend in this pass:
// writes the Notification row and emits notification:new to the user's
// personal room. Never optional, regardless of the user's channel
// preferences.
export class InAppChannel implements NotificationChannel {
  isEnabled(): boolean {
    return true;
  }

  async send(notification: NotificationPayload): Promise<"SENT" | "FAILED"> {
    try {
      const created = await prisma.notification.create({
        data: {
          userId: notification.userId,
          audience: "USER",
          title: notification.title,
          body: notification.body,
          dedupeKey: notification.dedupeKey
        }
      });
      io.to(`user:${notification.userId}`).emit("notification:new", {
        id: created.id,
        title: created.title,
        body: created.body,
        isRead: created.isRead,
        createdAt: created.createdAt
      });
      return "SENT";
    } catch (err) {
      // Section 18.2 — a duplicate dedupeKey means this event was already
      // delivered (e.g. a retried fan-out after a restart); that is
      // success, not a failure to report.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return "SENT";
      }
      console.error("InAppChannel.send failed", err);
      return "FAILED";
    }
  }
}
