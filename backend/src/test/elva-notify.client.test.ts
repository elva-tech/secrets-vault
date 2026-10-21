import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import { getElvaNotifyClient, resetElvaNotifyClientCache } from '../modules/notifications/elva-notify.client.js';
import { ElvaNotifyApiError } from '../modules/notifications/elva-notify.types.js';

describe('ElvaNotifyClient', () => {
  beforeEach(() => {
    resetEnvCache();
    resetElvaNotifyClientCache();
    process.env.ELVA_NOTIFY_API_BASE = 'https://api.notify.elvatech.in';
    process.env.ELVA_NOTIFY_APP_ID = 'app-test';
    process.env.ELVA_NOTIFY_API_KEY = 'key-test-12345678';
    process.env.ELVA_NOTIFY_BRAND_ID = 'brand-test';
    process.env.ELVA_NOTIFY_TIMEOUT_MS = '5000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEnvCache();
    resetElvaNotifyClientCache();
  });

  it('POST /otp/send with body auth and no Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, expiresIn: 300, requestId: 'req-otp-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = getElvaNotifyClient();
    const result = await client.sendOtp('user@example.test');
    expect(result.requestId).toBe('req-otp-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.notify.elvatech.in/otp/send');
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Authorization');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      appId: 'app-test',
      apiKey: 'key-test-12345678',
      brandId: 'brand-test',
      channel: 'EMAIL',
      email: 'user@example.test',
    });
    expect(JSON.stringify(body)).not.toMatch(/Bearer/);
  });

  it('POST /otp/verify with submitted otp', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, requestId: 'req-verify-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getElvaNotifyClient().verifyOtp('user@example.test', '123456');
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.otp).toBe('123456');
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/otp/verify');
  });

  it('POST /notify for transactional email includes brandId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, requestId: 'req-mail-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getElvaNotifyClient().sendTransactionalEmail({
      to: 'user@example.test',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.channel).toBe('EMAIL');
    expect(body.brandId).toBe('brand-test');
    expect(body.to).toEqual(['user@example.test']);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/notify');
  });

  it('maps 401 to non-retryable error with requestId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized', requestId: 'rid-401' }),
      }),
    );
    await expect(getElvaNotifyClient().sendOtp('a@b.test')).rejects.toMatchObject({
      name: 'ElvaNotifyApiError',
      code: 'NOTIFY_UNAUTHORIZED',
      retryable: false,
      requestId: 'rid-401',
    });
  });

  it('maps 503 to retryable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ message: 'unavailable', requestId: 'rid-503' }),
      }),
    );
    await expect(getElvaNotifyClient().sendOtp('a@b.test')).rejects.toMatchObject({
      retryable: true,
      requestId: 'rid-503',
    });
  });
});
