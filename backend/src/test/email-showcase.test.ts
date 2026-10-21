import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import {
  IMPLEMENTED_EMAIL_SHOWCASE,
  SHOWCASE_ALLOWED_RECIPIENT,
} from '../modules/notifications/email-showcase.catalog.js';
import {
  assertShowcaseRecipient,
  assertSafeForShowcaseSend,
  renderShowcaseEmail,
  sendShowcaseEmail,
} from '../modules/notifications/email-showcase.runner.js';
import { resetNotificationProviderCache } from '../modules/notifications/notification-provider.factory.js';

describe('email showcase safety', () => {
  beforeEach(() => {
    resetEnvCache();
    resetNotificationProviderCache();
    vi.unstubAllEnvs();
  });

  it('rejects non-allowlisted recipients', () => {
    expect(() => assertShowcaseRecipient('other@example.com')).toThrow(SHOWCASE_ALLOWED_RECIPIENT);
    assertShowcaseRecipient(SHOWCASE_ALLOWED_RECIPIENT);
  });

  it('blocks live send in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOTIFICATION_PROVIDER', 'elva_notify');
    vi.stubEnv('ELVA_NOTIFY_APP_ID', 'app');
    vi.stubEnv('ELVA_NOTIFY_API_KEY', 'test-api-key-8chars');
    vi.stubEnv('ELVA_NOTIFY_BRAND_ID', 'brand');
    resetEnvCache();
    expect(() => assertSafeForShowcaseSend()).toThrow(/production/i);
  });

  it('renders all implemented templates without forbidden patterns', () => {
    for (const def of IMPLEMENTED_EMAIL_SHOWCASE) {
      const rendered = renderShowcaseEmail(def);
      expect(rendered.subject).toContain('[ELVA VAULT EMAIL PREVIEW]');
      expect(rendered.textPreview).toMatch(/synthetic/i);
      expect(rendered.textPreview).not.toMatch(/sk_live|Bearer\s+[A-Za-z0-9]{20}/);
    }
  });

  it('deliver uses only allowlisted address', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NOTIFICATION_PROVIDER', 'elva_notify');
    vi.stubEnv('ELVA_NOTIFY_APP_ID', 'app');
    vi.stubEnv('ELVA_NOTIFY_API_KEY', 'test-api-key-8chars');
    vi.stubEnv('ELVA_NOTIFY_BRAND_ID', 'brand');
    resetEnvCache();
    resetNotificationProviderCache();

    const deliver = vi.fn().mockResolvedValue({ provider: 'mock', status: 'sent', messageId: 'msg-1' });
    const factory = await import('../modules/notifications/notification-provider.factory.js');
    vi.spyOn(factory, 'getNotificationProviderStatus').mockReturnValue({
      provider: 'elva_notify',
      configured: true,
    });
    vi.spyOn(factory, 'getNotificationEmailProvider').mockReturnValue({
      name: 'mock',
      deliver,
    });

    const def = IMPLEMENTED_EMAIL_SHOWCASE[0]!;
    await expect(sendShowcaseEmail(def, 'test-run')).resolves.toMatchObject({
      identifier: 'ACCESS_REQUESTED',
      provider: 'mock',
      messageId: 'msg-1',
    });
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: SHOWCASE_ALLOWED_RECIPIENT }),
    );
  });
});
