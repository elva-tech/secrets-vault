import { Router } from 'express';
import mongoose from 'mongoose';
import { getHostnameResolver } from '../middleware/hostname-resolution.middleware.js';
import { getNotificationProviderStatus } from '../../modules/notifications/notification-provider.factory.js';
import { loadEnv } from '../../config/env.js';

export function createHealthRouter(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  router.get('/ready', (_req, res) => {
    try {
      const dbReady = mongoose.connection.readyState === 1;
      const env = loadEnv();
      const notify = getNotificationProviderStatus();
      const storageProvider = env.OBJECT_STORAGE_PROVIDER;
      const storageConfigured =
        storageProvider === 'local' ||
        (storageProvider === 's3' && Boolean(env.S3_BUCKET)) ||
        (storageProvider === 'cloudinary' &&
          Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET));
      const ready = dbReady && notify.configured && storageConfigured;
      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        providers: {
          notifications: { provider: notify.provider, configured: notify.configured },
          objectStorage: { provider: storageProvider, configured: storageConfigured },
        },
      });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });
  router.get('/config/public', (_req, res) => {
    res.json({
      baseDomain: getHostnameResolver().getBaseDomain(),
    });
  });
  return router;
}
