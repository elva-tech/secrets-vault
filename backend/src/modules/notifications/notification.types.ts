export type NotificationEvent =
  | 'ACCESS_REQUESTED'
  | 'ACCESS_APPROVED'
  | 'ACCESS_REJECTED'
  | 'ACCESS_GRANTED'
  | 'ROTATION_REMINDER'
  | 'ROTATION_COMPLETED'
  | 'ROTATION_FAILED'
  | 'SECURITY_EVENT'
  | 'TENANT_USER_ADDED';

export type NotificationPayload = {
  event: NotificationEvent;
  tenantId: string;
  toUserId: string;
  subject: string;
  body: string;
  correlationId?: string;
};

export class NotificationDeliveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}
