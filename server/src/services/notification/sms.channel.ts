import { StubNotificationChannel } from "./stub-channel";

export class SmsChannel extends StubNotificationChannel {
  constructor() {
    super("SMS_PROVIDER", "SMS");
  }
}
