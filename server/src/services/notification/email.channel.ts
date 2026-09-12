import { StubNotificationChannel } from "./stub-channel";

export class EmailChannel extends StubNotificationChannel {
  constructor() {
    super("EMAIL_PROVIDER", "EMAIL");
  }
}
