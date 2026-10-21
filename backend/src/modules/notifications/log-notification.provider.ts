import { logger } from '../../config/logger.js';
import type { EmailDeliveryRequest, EmailDeliveryResult, NotificationEmailProvider } from './notification-provider.types.js';

/** Development / fallback provider — does not call an external API. */
export class LogNotificationProvider implements NotificationEmailProvider {
  readonly name = 'log';

  async deliver(request: EmailDeliveryRequest): Promise<EmailDeliveryResult> {
    logger.info('Notification (log provider)', {
      provider: this.name,
      event: request.event,
      tenantId: request.tenantId,
      subject: request.subject,
      correlationId: request.correlationId,
    });
    return { provider: this.name, status: 'logged' };
  }
}
