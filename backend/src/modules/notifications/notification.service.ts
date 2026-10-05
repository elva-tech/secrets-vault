import { logger } from '../../config/logger.js';

export type NotificationEvent =
  | 'ACCESS_REQUESTED'
  | 'ACCESS_APPROVED'
  | 'ACCESS_REJECTED'
  | 'OTP_CREATED'
  | 'ACCESS_GRANTED'
  | 'ROTATION_REMINDER'
  | 'ROTATION_COMPLETED'
  | 'ROTATION_FAILED'
  | 'SECURITY_EVENT';

export type NotificationPayload = {
  event: NotificationEvent;
  tenantId: string;
  toUserId: string;
  subject: string;
  body: string;
  /** Dev-only: never log in production paths */
  otpCode?: string;
};

/** In-memory dev sink for tests — not used in production responses */
const testSink: NotificationPayload[] = [];

export class NotificationService {
  async send(payload: NotificationPayload): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      testSink.push({ ...payload, otpCode: payload.otpCode });
    }
    logger.info('Notification dispatched', {
      event: payload.event,
      tenantId: payload.tenantId,
      toUserId: payload.toUserId,
      subject: payload.subject,
    });
  }

  static drainTestNotifications(): NotificationPayload[] {
    return testSink.splice(0, testSink.length);
  }

  static clearTestNotifications(): void {
    testSink.length = 0;
  }
}
