import type { NotificationEvent } from './notification.types.js';

export type EmailDeliveryRequest = {
  event: NotificationEvent;
  tenantId: string;
  toEmail: string;
  toName?: string;
  subject: string;
  text: string;
  html?: string;
  correlationId?: string;
};

export type EmailDeliveryResult = {
  provider: string;
  messageId?: string;
  status: 'sent' | 'queued' | 'logged';
};

export interface NotificationEmailProvider {
  readonly name: string;
  deliver(request: EmailDeliveryRequest): Promise<EmailDeliveryResult>;
}
