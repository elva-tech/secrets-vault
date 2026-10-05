export enum NonOwnerBehavior {
  DENY = 'DENY',
  ALLOW = 'ALLOW',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
}

export enum AccessRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  OTP_GENERATED = 'OTP_GENERATED',
  OTP_VERIFIED = 'OTP_VERIFIED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  CANCELLED = 'CANCELLED',
}

export enum OtpStatus {
  ACTIVE = 'ACTIVE',
  VERIFIED = 'VERIFIED',
  EXPIRED = 'EXPIRED',
  LOCKED = 'LOCKED',
  REVOKED = 'REVOKED',
}

export enum AccessGrantStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export enum PolicyResourceType {
  SECRET = 'SECRET',
  FILE = 'FILE',
  ENVIRONMENT = 'ENVIRONMENT',
}

import { AuthorizationDecision } from './authorization.js';

export type VaultAccessDecisionResult = {
  decision: AuthorizationDecision;
  reason: string;
  requiredPermission?: string;
  resourceId?: string;
};

export { AuthorizationDecision };
