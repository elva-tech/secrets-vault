import { Router } from 'express';
import mongoose from 'mongoose';
import { getHostnameResolver } from '../middleware/hostname-resolution.middleware.js';

export function createHealthRouter(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  router.get('/ready', (_req, res) => {
    try {
      const dbReady = mongoose.connection.readyState === 1;
      res.status(dbReady ? 200 : 503).json({ status: dbReady ? 'ready' : 'not_ready' });
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
