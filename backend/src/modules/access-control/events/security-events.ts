export type SecurityEventType =
  | 'ACCESS_REQUESTED'
  | 'ACCESS_APPROVED'
  | 'ACCESS_REJECTED'
  | 'OTP_GENERATED'
  | 'OTP_VERIFIED'
  | 'ACCESS_GRANTED'
  | 'ACCESS_REVOKED';

export type SecurityEventPayload = {
  type: SecurityEventType;
  tenantId: string;
  userId?: string;
  resourceIds?: string[];
  accessRequestId?: string;
  grantId?: string;
  timestamp: Date;
};

const listeners: Array<(event: SecurityEventPayload) => void> = [];

export function emitSecurityEvent(event: SecurityEventPayload): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function onSecurityEvent(listener: (event: SecurityEventPayload) => void): void {
  listeners.push(listener);
}
