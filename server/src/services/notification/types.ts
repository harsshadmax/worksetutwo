// Section 18.1 — the channel abstraction so email/SMS/push can be added
// later without a redesign.
export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  /// Section 18.2 — stable per-event key (e.g. "booking:{id}:assigned").
  /// Omit for ad hoc/admin-broadcast notifications with no natural key.
  dedupeKey?: string;
}

export interface NotificationChannel {
  /// Section 18.4 — false means "skip, don't attempt" (unconfigured in
  /// production); true means send() is safe to call. InAppChannel is
  /// always true — it is never optional (Section 18.1).
  isEnabled(): boolean;
  send(notification: NotificationPayload): Promise<"SENT" | "FAILED">;
}
