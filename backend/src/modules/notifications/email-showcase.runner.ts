import { buildEmailContent } from './email-content.js';
import {
  allShowcaseDefinitions,
  IMPLEMENTED_EMAIL_SHOWCASE,
  SHOWCASE_ALLOWED_RECIPIENT,
  SHOWCASE_SUBJECT_PREFIX,
  SHOWCASE_WORKSPACE_URL,
  type EmailShowcaseDefinition,
} from './email-showcase.catalog.js';
import { getNotificationEmailProvider, getNotificationProviderStatus } from './notification-provider.factory.js';
import type { NotificationEvent } from './notification.types.js';

const FORBIDDEN_BODY_PATTERN =
  /(?:api[_-]?key|password\s*[:=]|secret\s*[:=]|sk_live|Bearer\s+[A-Za-z0-9]|otp\s*[:=]\s*\d{4,})/i;

export function assertShowcaseRecipient(email: string): void {
  const normalized = email.trim().toLowerCase();
  if (normalized !== SHOWCASE_ALLOWED_RECIPIENT) {
    throw new Error(`Showcase recipient must be exactly ${SHOWCASE_ALLOWED_RECIPIENT}`);
  }
}

export function assertSafeForShowcaseSend(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Showcase email send is blocked when NODE_ENV=production');
  }
  const status = getNotificationProviderStatus();
  if (status.provider !== 'elva_notify' || !status.configured) {
    throw new Error(
      'Showcase live send requires NOTIFICATION_PROVIDER=elva_notify and ELVA Notify credentials configured locally',
    );
  }
}

export type RenderedShowcaseEmail = {
  identifier: string;
  event: string;
  subject: string;
  textLength: number;
  htmlLength: number;
  textPreview: string;
  safetyGroup: string;
  canSendLive: boolean;
};

export function renderShowcaseEmail(def: EmailShowcaseDefinition): RenderedShowcaseEmail {
  const { subject, body } = def.buildPayload();
  const fullSubject = `${SHOWCASE_SUBJECT_PREFIX} ${subject}`;
  const { text, html } = buildEmailContent({ subject: fullSubject, body }, SHOWCASE_WORKSPACE_URL);
  if (FORBIDDEN_BODY_PATTERN.test(text)) {
    throw new Error(`Showcase body failed safety scan for ${def.identifier}`);
  }
  const previewLines = text.split('\n').slice(0, 6);
  return {
    identifier: def.identifier,
    event: def.event,
    subject: fullSubject,
    textLength: text.length,
    htmlLength: html.length,
    textPreview: previewLines.join('\n'),
    safetyGroup: def.safetyGroup,
    canSendLive: def.canSendLive,
  };
}

export type ShowcaseSendResult = {
  identifier: string;
  event: string;
  subject: string;
  provider: string;
  status: string;
  messageId?: string;
  correlationId: string;
};

export async function sendShowcaseEmail(
  def: EmailShowcaseDefinition,
  runId: string,
): Promise<ShowcaseSendResult> {
  if (!def.canSendLive) {
    throw new Error(`${def.identifier} is not eligible for live showcase send`);
  }
  assertSafeForShowcaseSend();
  assertShowcaseRecipient(SHOWCASE_ALLOWED_RECIPIENT);

  const { subject, body } = def.buildPayload();
  const fullSubject = `${SHOWCASE_SUBJECT_PREFIX} ${subject}`;
  const { text, html } = buildEmailContent({ subject: fullSubject, body }, SHOWCASE_WORKSPACE_URL);
  if (FORBIDDEN_BODY_PATTERN.test(text)) {
    throw new Error(`Showcase body failed safety scan for ${def.identifier}`);
  }

  const correlationId = `showcase:${runId}:${def.identifier}`;
  const provider = getNotificationEmailProvider();
  const result = await provider.deliver({
    event: def.event as NotificationEvent,
    tenantId: '000000000000000000000000',
    toEmail: SHOWCASE_ALLOWED_RECIPIENT,
    toName: 'ELVA Vault Preview',
    subject: fullSubject,
    text,
    html,
    correlationId,
  });

  return {
    identifier: def.identifier,
    event: def.event,
    subject: fullSubject,
    provider: result.provider,
    status: result.status,
    messageId: result.messageId,
    correlationId,
  };
}

export function listInventory(): EmailShowcaseDefinition[] {
  return allShowcaseDefinitions();
}

export function listSendableShowcase(): EmailShowcaseDefinition[] {
  return IMPLEMENTED_EMAIL_SHOWCASE.filter((d) => d.canSendLive);
}
