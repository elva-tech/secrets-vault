import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { isAllowedWebOrigin } from './http/utils/cors-origin.js';
import { requestIdMiddleware } from './http/middleware/request-id.middleware.js';
import {
  cookieParserMiddleware,
  optionalSession,
} from './http/middleware/session.middleware.js';
import {
  hostnameResolutionMiddleware,
} from './http/middleware/hostname-resolution.middleware.js';
import { errorMiddleware } from './http/middleware/error.middleware.js';
import { createHealthRouter } from './http/routes/health.routes.js';
import { createAuthRouter } from './http/routes/auth.routes.js';
import { createPlatformRouter } from './http/routes/platform.routes.js';
import { createTenantRouter } from './http/routes/tenant.routes.js';
import {
  createApplicationsRouter,
  createEnvironmentsRouter,
} from './http/routes/applications.routes.js';
import { createVaultRouter } from './http/routes/vault.routes.js';
import { createAccessControlRouter } from './http/routes/access-control.routes.js';
import { createPersonalVaultRouter } from './http/routes/personal-vault.routes.js';
import { createAuditRouter } from './http/routes/audit.routes.js';
import { registerAuditListeners } from './modules/audit/audit-register.js';

export function createApp(): express.Application {
  registerAuditListeners();
  const env = loadEnv();
  const app = express();

  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (isAllowedWebOrigin(origin, env)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParserMiddleware);
  app.use(hostnameResolutionMiddleware);
  app.use(optionalSession);

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use('/api', createHealthRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api/platform', createPlatformRouter());
  app.use('/api/tenant', createTenantRouter());
  app.use('/api/applications', createApplicationsRouter());
  app.use('/api/environments', createEnvironmentsRouter());
  app.use('/api/vault', createVaultRouter());
  app.use('/api', createAccessControlRouter());
  app.use('/api/personal-vault', createPersonalVaultRouter());
  app.use('/api', createAuditRouter());

  if (env.SERVE_WEB) {
    const webDist = path.join(fileURLToPath(new URL('.', import.meta.url)), '../../../frontend/dist');
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  app.use(errorMiddleware);

  return app;
}
