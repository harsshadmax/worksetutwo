import { prisma } from "../lib/prisma";
import { InAppChannel } from "./notification/in-app.channel";
import { EmailChannel } from "./notification/email.channel";
import { SmsChannel } from "./notification/sms.channel";
import { PushChannel } from "./notification/push.channel";
import { NotificationChannel, NotificationPayload } from "./notification/types";

const inAppChannel = new InAppChannel();
const optionalChannels: Record<string, NotificationChannel> = {
  EMAIL: new EmailChannel(),
  SMS: new SmsChannel(),
  PUSH: new PushChannel()
};

// Section 18.1 — fans a single logical notification event out to whichever
// channels are enabled for that user's preferences, always including
// InAppChannel regardless of preference. Section 18.2's retry-queue
// mechanism for real channel failures is not built in this pass — the
// stub channels never genuinely fail (they either return SENT in
// development or are skipped via isEnabled() when unconfigured), so there
// is nothing for a retry queue to act on until a real provider exists,
// which is explicitly OUT of scope (Section 0.4).
export async function dispatchNotification(payload: NotificationPayload): Promise<void> {
  await inAppChannel.send(payload);

  const preference = await prisma.userPreference.findUnique({ where: { userId: payload.userId } });
  const requestedChannels = (preference?.notificationChannels ?? []).filter((c) => c !== "IN_APP");

  for (const name of requestedChannels) {
    const channel = optionalChannels[name];
    if (channel && channel.isEnabled()) {
      await channel.send(payload).catch(() => "FAILED" as const);
    }
  }
}
