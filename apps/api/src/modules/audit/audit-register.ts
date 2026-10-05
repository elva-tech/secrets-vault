import { AuditAction, AuditResult } from '@vault/shared';
import { onSecurityEvent } from '../access-control/events/security-events.js';
import { AuditService } from './services/audit.service.js';

const audit = new AuditService();

const eventMap: Record<string, AuditAction> = {
  ACCESS_REQUESTED: AuditAction.ACCESS_REQUEST_CREATED,
  ACCESS_APPROVED: AuditAction.ACCESS_REQUEST_APPROVED,
  ACCESS_REJECTED: AuditAction.ACCESS_REQUEST_REJECTED,
  OTP_GENERATED: AuditAction.OTP_GENERATED,
  OTP_VERIFIED: AuditAction.OTP_VERIFIED,
  ACCESS_GRANTED: AuditAction.ACCESS_GRANTED,
  ACCESS_REVOKED: AuditAction.ACCESS_REVOKED,
};

export function registerAuditListeners(): void {
  onSecurityEvent((event) => {
    const action = eventMap[event.type];
    if (!action || !event.userId) return;
    void audit.record({
      tenantId: event.tenantId,
      actorId: event.userId,
      action,
      result: AuditResult.ALLOWED,
      resourceType: 'ACCESS',
      resourceId: event.accessRequestId ?? event.grantId,
      additionalMetadata: {
        resourceIds: event.resourceIds,
        grantId: event.grantId,
      },
    });
  });
}

export function getAuditService(): AuditService {
  return audit;
}
