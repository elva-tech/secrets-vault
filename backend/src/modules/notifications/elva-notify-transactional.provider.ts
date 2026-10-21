import { getElvaNotifyClient } from './elva-notify.client.js';
import { ElvaNotifyApiError } from './elva-notify.types.js';
import { NotificationDeliveryError } from './notification.types.js';
import type { EmailDeliveryRequest, EmailDeliveryResult, NotificationEmailProvider } from './notification-provider.types.js';

export class ElvaNotifyTransactionalProvider implements NotificationEmailProvider {
  readonly name = 'elva_notify';

  async deliver(request: EmailDeliveryRequest): Promise<EmailDeliveryResult> {
    try {
      const client = getElvaNotifyClient();
      const result = await client.sendTransactionalEmail({
        to: request.toEmail,
        subject: request.subject,
        html: request.html ?? request.text,
      });
      return {
        provider: this.name,
        messageId: result.requestId,
        status: 'sent',
      };
    } catch (err) {
      if (err instanceof ElvaNotifyApiError) {
        throw new NotificationDeliveryError(err.code, err.message, err.retryable);
      }
      throw err;
    }
  }
}
