import { StubNotificationChannel } from "./stub-channel";

export class PushChannel extends StubNotificationChannel {
  constructor() {
    super("PUSH_PROVIDER", "PUSH");
  }
}
