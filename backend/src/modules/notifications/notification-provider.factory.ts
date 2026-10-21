import { loadEnv } from '../../config/env.js';
import { ElvaNotifyTransactionalProvider } from './elva-notify-transactional.provider.js';
import { LogNotificationProvider } from './log-notification.provider.js';
import type { NotificationEmailProvider } from './notification-provider.types.js';

let cached: NotificationEmailProvider | null = null;

export function getNotificationEmailProvider(): NotificationEmailProvider {
  if (cached) return cached;
  const { NOTIFICATION_PROVIDER } = loadEnv();
  cached =
    NOTIFICATION_PROVIDER === 'elva_notify'
      ? new ElvaNotifyTransactionalProvider()
      : new LogNotificationProvider();
  return cached;
}

export function resetNotificationProviderCache(): void {
  cached = null;
}

export function getNotificationProviderStatus(): {
  provider: string;
  configured: boolean;
} {
  const env = loadEnv();
  if (env.NOTIFICATION_PROVIDER === 'elva_notify') {
    const configured = Boolean(
      env.ELVA_NOTIFY_APP_ID && env.ELVA_NOTIFY_API_KEY && env.ELVA_NOTIFY_BRAND_ID,
    );
    return { provider: 'elva_notify', configured };
  }
  return { provider: 'log', configured: true };
}
