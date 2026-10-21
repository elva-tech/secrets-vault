import type { NotificationEvent } from './notification.types.js';

export const SHOWCASE_ALLOWED_RECIPIENT = 'arunpn866@gmail.com';

export const SHOWCASE_SUBJECT_PREFIX = '[ELVA VAULT EMAIL PREVIEW]';

export const SHOWCASE_DISCLAIMER =
  'This is a synthetic Secrets Vault email preview. No real secrets, credentials, or live access tokens are included.';

/** Fictional workspace used only for showcase link lines. */
export const SHOWCASE_WORKSPACE_URL = 'http://preview-demo.vault.localhost';

export type ShowcaseSafetyGroup = 'A' | 'B' | 'C';

export type EmailShowcaseDefinition = {
  event: NotificationEvent | 'ELVA_OTP_SEND';
  identifier: string;
  purpose: string;
  recipientCategory: string;
  sourceFile: string;
  enabled: boolean;
  safetyGroup: ShowcaseSafetyGroup;
  canSendLive: boolean;
  notes?: string;
  buildPayload: () => { subject: string; body: string };
};

const syntheticPortalPath = '/applications/app-preview-001/access';

function accessRequestedBody(): string {
  return [
    SHOWCASE_DISCLAIMER,
    '',
    'Alex Preview requested access to secret "SYNTHETIC_DB_CONFIG" (fictional).',
    'Reason: Showcase preview — no production data.',
    'Permissions: secret.reveal',
    `Review and approve or reject in the portal: ${syntheticPortalPath}`,
  ].join('\n');
}

function accessApprovedBody(): string {
  const expires = '2030-01-15T12:00:00.000Z';
  return [
    SHOWCASE_DISCLAIMER,
    '',
    'Your access request was approved in the Secrets Vault portal.',
    `Temporary access is active until ${expires}.`,
    `View grants: ${syntheticPortalPath}`,
  ].join('\n');
}

function accessGrantedBody(): string {
  return [
    SHOWCASE_DISCLAIMER,
    '',
    'Your temporary access is active until 2030-01-15T12:00:00.000Z.',
  ].join('\n');
}

function accessRejectedBody(): string {
  return [
    SHOWCASE_DISCLAIMER,
    '',
    'Your access request was declined in the Secrets Vault portal.',
    'Reason: Showcase preview — fictional rejection.',
    `Status: ${syntheticPortalPath}`,
  ].join('\n');
}

/** Implemented notification emails (NotificationService.send → NOTIFICATION_DELIVERY job). */
export const IMPLEMENTED_EMAIL_SHOWCASE: EmailShowcaseDefinition[] = [
  {
    event: 'ACCESS_REQUESTED',
    identifier: 'ACCESS_REQUESTED',
    purpose: 'Notify resource owner / app managers of a new access request',
    recipientCategory: 'Approver (owner or application MANAGER)',
    sourceFile: 'access-request.service.ts (create)',
    enabled: true,
    safetyGroup: 'A',
    canSendLive: true,
    buildPayload: () => ({
      subject: 'Access request pending review',
      body: accessRequestedBody(),
    }),
  },
  {
    event: 'ACCESS_APPROVED',
    identifier: 'ACCESS_APPROVED',
    purpose: 'Notify requester that their access request was approved',
    recipientCategory: 'Access requester',
    sourceFile: 'access-request.service.ts (approve)',
    enabled: true,
    safetyGroup: 'A',
    canSendLive: true,
    buildPayload: () => ({
      subject: 'Access request approved',
      body: accessApprovedBody(),
    }),
  },
  {
    event: 'ACCESS_GRANTED',
    identifier: 'ACCESS_GRANTED',
    purpose: 'Secondary notice that temporary grant is active (sent with approve)',
    recipientCategory: 'Access requester',
    sourceFile: 'access-request.service.ts (approve)',
    enabled: true,
    safetyGroup: 'A',
    canSendLive: true,
    notes: 'Duplicate path on approve; separate email from ACCESS_APPROVED.',
    buildPayload: () => ({
      subject: 'Access granted',
      body: accessGrantedBody(),
    }),
  },
  {
    event: 'ACCESS_REJECTED',
    identifier: 'ACCESS_REJECTED',
    purpose: 'Notify requester that their access request was declined',
    recipientCategory: 'Access requester',
    sourceFile: 'access-request.service.ts (reject)',
    enabled: true,
    safetyGroup: 'A',
    canSendLive: true,
    buildPayload: () => ({
      subject: 'Access request declined',
      body: accessRejectedBody(),
    }),
  },
  {
    event: 'ROTATION_REMINDER',
    identifier: 'ROTATION_REMINDER',
    purpose: 'Upcoming credential rotation reminder',
    recipientCategory: 'Secret owner',
    sourceFile: 'job-worker.service.ts (ROTATION_REMINDER job)',
    enabled: true,
    safetyGroup: 'A',
    canSendLive: true,
    buildPayload: () => ({
      subject: 'Credential rotation reminder',
      body: [
        SHOWCASE_DISCLAIMER,
        '',
        'Secret SYNTHETIC_ROTATION_TARGET rotates in 7 day(s).',
      ].join('\n'),
    }),
  },
  {
    event: 'ROTATION_COMPLETED',
    identifier: 'ROTATION_COMPLETED',
    purpose: 'Rotation workflow completed successfully',
    recipientCategory: 'Actor who performed rotation',
    sourceFile: 'rotation.service.ts',
    enabled: true,
    safetyGroup: 'A',
    canSendLive: true,
    buildPayload: () => ({
      subject: 'Credential rotation completed',
      body: [SHOWCASE_DISCLAIMER, '', 'Secret SYNTHETIC_ROTATION_TARGET was rotated successfully.'].join('\n'),
    }),
  },
  {
    event: 'TENANT_USER_ADDED',
    identifier: 'TENANT_USER_ADDED',
    purpose: 'User added to tenant workspace',
    recipientCategory: 'New tenant member',
    sourceFile: 'tenant-user.service.ts',
    enabled: true,
    safetyGroup: 'B',
    canSendLive: true,
    notes: 'Normally requires DB user; showcase overrides recipient only.',
    buildPayload: () => ({
      subject: 'Workspace access granted',
      body: [
        SHOWCASE_DISCLAIMER,
        '',
        'You have been added to a Secrets Vault workspace. Sign in with your tenant hostname to get started.',
      ].join('\n'),
    }),
  },
];

/** Declared in notification.types but not emitted by NotificationService.send today. */
export const INVENTORY_ONLY_EMAIL_TYPES: EmailShowcaseDefinition[] = [
  {
    event: 'ROTATION_FAILED',
    identifier: 'ROTATION_FAILED',
    purpose: 'Would notify on rotation failure',
    recipientCategory: 'Unknown (not implemented)',
    sourceFile: 'notification.types.ts only',
    enabled: false,
    safetyGroup: 'C',
    canSendLive: false,
    notes: 'Audit ROTATION_FAILED is recorded; no email send path.',
    buildPayload: () => ({
      subject: 'Credential rotation failed',
      body: [SHOWCASE_DISCLAIMER, '', 'Secret SYNTHETIC_ROTATION_TARGET rotation failed (preview only).'].join('\n'),
    }),
  },
  {
    event: 'SECURITY_EVENT',
    identifier: 'SECURITY_EVENT',
    purpose: 'Generic security alert',
    recipientCategory: 'Unknown (not implemented)',
    sourceFile: 'notification.types.ts only',
    enabled: false,
    safetyGroup: 'C',
    canSendLive: false,
    notes: 'Security events use emitSecurityEvent / audit; no email.',
    buildPayload: () => ({
      subject: 'Security event (preview)',
      body: [SHOWCASE_DISCLAIMER, '', 'Synthetic security event — not sent by app.'].join('\n'),
    }),
  },
  {
    event: 'ELVA_OTP_SEND',
    identifier: 'ELVA_OTP_EMAIL',
    purpose: 'OTP email via ELVA Notify /otp/send',
    recipientCategory: 'OTP recipient',
    sourceFile: 'elva-notify.client.ts',
    enabled: false,
    safetyGroup: 'C',
    canSendLive: false,
    notes: 'Not used for portal access approval. Sending OTP would deliver a live code — render-only.',
    buildPayload: () => ({
      subject: 'OTP (not sent — ELVA-hosted template)',
      body: [
        SHOWCASE_DISCLAIMER,
        '',
        'OTP emails are generated by ELVA Notify, not Secrets Vault templates. Do not send live OTP for showcase.',
      ].join('\n'),
    }),
  },
];

export function allShowcaseDefinitions(): EmailShowcaseDefinition[] {
  return [...IMPLEMENTED_EMAIL_SHOWCASE, ...INVENTORY_ONLY_EMAIL_TYPES];
}
