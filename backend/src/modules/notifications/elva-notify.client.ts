import { loadEnv } from '../../config/env.js';
import {
  ElvaNotifyApiError,
  type ElvaNotifyOtpSendResponse,
  type ElvaNotifyOtpVerifyResponse,
  type ElvaNotifyTransactionalResponse,
} from './elva-notify.types.js';

const DEFAULT_API_BASE = 'https://api.notify.elvatech.in';

function resolveApiBase(): string {
  const env = loadEnv();
  return (env.ELVA_NOTIFY_API_BASE ?? env.ELVA_NOTIFY_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, '');
}

function credentials() {
  const env = loadEnv();
  const appId = env.ELVA_NOTIFY_APP_ID;
  const apiKey = env.ELVA_NOTIFY_API_KEY;
  const brandId = env.ELVA_NOTIFY_BRAND_ID;
  if (!appId || !apiKey) {
    throw new ElvaNotifyApiError('NOTIFY_NOT_CONFIGURED', 'ELVA Notify credentials missing', false);
  }
  return { appId, apiKey, brandId };
}

function sanitizeForLog(text: string): string {
  return text.replace(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey":"[redacted]"').slice(0, 400);
}

function mapHttpError(status: number, body: string, parsed: Record<string, unknown>): ElvaNotifyApiError {
  const requestId = typeof parsed.requestId === 'string' ? parsed.requestId : undefined;
  const message =
    typeof parsed.message === 'string'
      ? parsed.message
      : `ELVA Notify request failed (${status})`;
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) {
    return new ElvaNotifyApiError('NOTIFY_UNAUTHORIZED', message, false, requestId, status);
  }
  if (status === 429 || lower.includes('rate limit')) {
    return new ElvaNotifyApiError('NOTIFY_RATE_LIMITED', message, true, requestId, status);
  }
  if (lower.includes('cooldown')) {
    return new ElvaNotifyApiError('NOTIFY_COOLDOWN', message, false, requestId, status);
  }
  if (lower.includes('expired')) {
    return new ElvaNotifyApiError('OTP_EXPIRED', message, false, requestId, status);
  }
  if (lower.includes('incorrect') || lower.includes('invalid otp')) {
    return new ElvaNotifyApiError('OTP_INVALID', message, false, requestId, status);
  }
  if (status >= 500) {
    return new ElvaNotifyApiError('NOTIFY_SERVER_ERROR', sanitizeForLog(message), true, requestId, status);
  }
  return new ElvaNotifyApiError('NOTIFY_CLIENT_ERROR', sanitizeForLog(message), false, requestId, status);
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const env = loadEnv();
  const url = `${resolveApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ELVA_NOTIFY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let parsed: Record<string, unknown> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }
    if (!res.ok) {
      throw mapHttpError(res.status, raw, parsed);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof ElvaNotifyApiError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ElvaNotifyApiError('NOTIFY_TIMEOUT', 'ELVA Notify request timed out', true);
    }
    throw new ElvaNotifyApiError('NOTIFY_NETWORK_ERROR', 'ELVA Notify network error', true);
  } finally {
    clearTimeout(timeout);
  }
}

export class ElvaNotifyClient {
  async sendOtp(email: string): Promise<ElvaNotifyOtpSendResponse> {
    const { appId, apiKey, brandId } = credentials();
    if (!brandId) {
      throw new ElvaNotifyApiError('NOTIFY_BRAND_REQUIRED', 'ELVA_NOTIFY_BRAND_ID is required for OTP', false);
    }
    const result = await postJson<ElvaNotifyOtpSendResponse>('/otp/send', {
      appId,
      apiKey,
      brandId,
      channel: 'EMAIL',
      email,
    });
    if (result.success === false) {
      throw new ElvaNotifyApiError(
        'OTP_SEND_FAILED',
        result.message ?? 'OTP send failed',
        false,
        result.requestId,
      );
    }
    return result;
  }

  async resendOtp(email: string): Promise<ElvaNotifyOtpSendResponse> {
    const { appId, apiKey, brandId } = credentials();
    if (!brandId) {
      throw new ElvaNotifyApiError('NOTIFY_BRAND_REQUIRED', 'ELVA_NOTIFY_BRAND_ID is required for OTP', false);
    }
    const result = await postJson<ElvaNotifyOtpSendResponse>('/otp/resend', {
      appId,
      apiKey,
      brandId,
      channel: 'EMAIL',
      email,
    });
    if (result.success === false) {
      throw new ElvaNotifyApiError(
        'OTP_RESEND_FAILED',
        result.message ?? 'OTP resend failed',
        false,
        result.requestId,
      );
    }
    return result;
  }

  async verifyOtp(email: string, otp: string): Promise<ElvaNotifyOtpVerifyResponse> {
    const { appId, apiKey, brandId } = credentials();
    if (!brandId) {
      throw new ElvaNotifyApiError('NOTIFY_BRAND_REQUIRED', 'ELVA_NOTIFY_BRAND_ID is required for OTP', false);
    }
    const result = await postJson<ElvaNotifyOtpVerifyResponse>('/otp/verify', {
      appId,
      apiKey,
      brandId,
      channel: 'EMAIL',
      email,
      otp,
    });
    if (result.success === false) {
      throw new ElvaNotifyApiError(
        'OTP_VERIFY_FAILED',
        result.message ?? 'OTP verification failed',
        false,
        result.requestId,
      );
    }
    return result;
  }

  async sendTransactionalEmail(input: {
    to: string;
    subject: string;
    html: string;
  }): Promise<ElvaNotifyTransactionalResponse> {
    const { appId, apiKey, brandId } = credentials();
    if (!brandId) {
      throw new ElvaNotifyApiError(
        'NOTIFY_BRAND_REQUIRED',
        'ELVA_NOTIFY_BRAND_ID is required for transactional email',
        false,
      );
    }
    const result = await postJson<ElvaNotifyTransactionalResponse>('/notify', {
      appId,
      apiKey,
      brandId,
      channel: 'EMAIL',
      to: [input.to],
      subject: input.subject,
      html: input.html,
    });
    if (result.success === false) {
      throw new ElvaNotifyApiError(
        'NOTIFY_DELIVERY_FAILED',
        result.message ?? 'Email delivery failed',
        false,
        result.requestId,
      );
    }
    return result;
  }
}

let clientInstance: ElvaNotifyClient | null = null;

export function getElvaNotifyClient(): ElvaNotifyClient {
  if (!clientInstance) clientInstance = new ElvaNotifyClient();
  return clientInstance;
}

export function resetElvaNotifyClientCache(): void {
  clientInstance = null;
}
