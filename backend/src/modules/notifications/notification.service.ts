import { loadEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { JobQueueService } from '../jobs/services/job-queue.service.js';
import { TenantRepository } from '../tenant/repositories/tenant.repository.js';
import { UserRepository } from '../users/repositories/user.repository.js';
import { getNotificationEmailProvider } from './notification-provider.factory.js';
import type { EmailDeliveryRequest } from './notification-provider.types.js';
import { buildEmailContent } from './email-content.js';
import {
  NotificationDeliveryError,
  type NotificationPayload,
} from './notification.types.js';

export type { NotificationEvent, NotificationPayload } from './notification.types.js';

/** In-memory dev sink for tests — not used in production responses */
const testSink: NotificationPayload[] = [];

export class NotificationService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly tenants = new TenantRepository(),
    private readonly queue = new JobQueueService(),
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      testSink.push({ ...payload });
      return;
    }

    const env = loadEnv();
    if (env.NOTIFICATION_PROVIDER === 'log') {
      logger.info('Notification dispatched (log provider)', {
        event: payload.event,
        tenantId: payload.tenantId,
        toUserId: payload.toUserId,
        subject: payload.subject,
        correlationId: payload.correlationId,
      });
      return;
    }

    const dedupKey = this.dedupKey(payload);
    const enqueued = await this.queue.enqueue(
      'NOTIFICATION_DELIVERY',
      dedupKey,
      payload,
      new Date(),
    );
    if (!enqueued) {
      logger.info('Notification deduplicated', {
        event: payload.event,
        tenantId: payload.tenantId,
        correlationId: payload.correlationId,
      });
    }
  }

  async deliverPayload(payload: NotificationPayload): Promise<void> {
    const user = await this.users.findById(payload.toUserId);
    if (!user) {
      throw new NotificationDeliveryError('RECIPIENT_NOT_FOUND', 'Notification recipient not found', false);
    }

    const tenant = await this.tenants.findById(payload.tenantId);
    const workspaceUrl = tenant?.primaryDomain
      ? `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${tenant.primaryDomain}`
      : undefined;

    const { text, html } = buildEmailContent(payload, workspaceUrl);
    const delivery: EmailDeliveryRequest = {
      event: payload.event,
      tenantId: payload.tenantId,
      toEmail: user.email,
      toName: user.displayName,
      subject: payload.subject,
      text,
      html,
      correlationId: payload.correlationId,
    };

    const provider = getNotificationEmailProvider();
    const result = await provider.deliver(delivery);
    logger.info('Notification delivered', {
      event: payload.event,
      tenantId: payload.tenantId,
      provider: result.provider,
      status: result.status,
      messageId: result.messageId,
      correlationId: payload.correlationId,
    });
  }

  private dedupKey(payload: NotificationPayload): string {
    const base = payload.correlationId ?? `${payload.event}:${payload.tenantId}:${payload.toUserId}`;
    return `notify:${base}`;
  }

  static drainTestNotifications(): NotificationPayload[] {
    return testSink.splice(0, testSink.length);
  }

  static clearTestNotifications(): void {
    testSink.length = 0;
  }
}
