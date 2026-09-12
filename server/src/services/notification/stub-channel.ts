import { NotificationChannel, NotificationPayload } from "./types";

// Section 18.1/18.4 — shared stub behavior for EmailChannel/SmsChannel/
// PushChannel: "email-ready," not "email-wired." A channel being fully
// unconfigured is not an error state. In development, always return SENT
// so notification-dependent flows are testable end-to-end without a real
// provider. In production, isEnabled() is false until a provider env var
// is set, so the dispatcher skips calling send() entirely — Section 18.2's
// real failure/retry path only activates once a real provider exists,
// which is explicitly OUT of scope for this pass (Section 0.4: "Real
// SMS/email/push notification delivery... Not built").
export abstract class StubNotificationChannel implements NotificationChannel {
  constructor(private readonly providerEnvVar: string, private readonly channelLabel: string) {}

  isEnabled(): boolean {
    if (process.env.NODE_ENV !== "production") return true;
    return Boolean(process.env[this.providerEnvVar]);
  }

  async send(notification: NotificationPayload): Promise<"SENT" | "FAILED"> {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV ${this.channelLabel} STUB] would send to user ${notification.userId}: ${notification.title}`);
      return "SENT";
    }
    // isEnabled() gates this in production — send() is never called by the
    // dispatcher when unconfigured, so reaching here in production would
    // mean a real provider is configured; no real provider exists in this
    // codebase (Section 0.4 OUT), so this path is unreachable today.
    return "FAILED";
  }
}
