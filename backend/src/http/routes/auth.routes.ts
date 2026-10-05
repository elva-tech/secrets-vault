import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../../modules/auth/services/auth.service.js';
import { TenantRepository } from '../../modules/tenant/repositories/tenant.repository.js';
import {
  requirePlatformHostname,
  requireTenantFromHostname,
} from '../middleware/tenant-resolution.middleware.js';
import {
  clearSessionCookie,
  optionalSession,
  requireSession,
  setSessionCookie,
} from '../middleware/session.middleware.js';
import { rejectClientTenantOverride } from '../middleware/tenant-resolution.middleware.js';
import rateLimit from 'express-rate-limit';
import { AuthorizationService } from '../../modules/access-control/authorization.service.js';
import { UserRepository } from '../../modules/users/repositories/user.repository.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
});

export function createAuthRouter(): Router {
  const router = Router();
  const authService = new AuthService();
  const tenants = new TenantRepository();
  const authorization = new AuthorizationService();
  const users = new UserRepository();

  router.post(
    '/platform/login',
    authLimiter,
    rejectClientTenantOverride,
    requirePlatformHostname,
    async (req, res, next) => {
      try {
        const body = loginSchema.parse(req.body);
        const result = await authService.loginPlatform({
          email: body.email,
          password: body.password,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        setSessionCookie(res, result.sessionId);
        res.json({ userId: result.userId, scope: 'platform' });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    '/tenant/login',
    authLimiter,
    rejectClientTenantOverride,
    requireTenantFromHostname,
    async (req, res, next) => {
      try {
        const body = loginSchema.parse(req.body);
        const tenant = await tenants.findBySlug(req.trustedTenant!.slug);
        if (!tenant) {
          res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
          return;
        }
        const result = await authService.loginTenant({
          email: body.email,
          password: body.password,
          tenant,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        setSessionCookie(res, result.sessionId);
        res.json({
          userId: result.userId,
          tenantId: result.tenantId,
          scope: 'tenant',
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post('/logout', optionalSession, async (req, res, next) => {
    try {
      if (req.auth) {
        await authService.logout(req.auth.sessionId);
      }
      clearSessionCookie(res);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  router.get('/me', requireSession, async (req, res, next) => {
    try {
      const user = await users.findById(req.auth!.userId);
      if (!user) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'User not found' } });
        return;
      }
      const payload: Record<string, unknown> = {
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          isPlatformSuperAdmin: user.isPlatformSuperAdmin,
        },
        session: {
          scope: req.auth!.scope,
          tenantId: req.auth!.tenantId,
        },
      };
      if (req.trustedTenant) {
        payload.tenant = req.trustedTenant;
      }
      if (req.auth!.scope === 'tenant' && req.auth!.tenantId) {
        payload.permissions = await authorization.getEffectivePermissions(
          req.auth!.userId,
          req.auth!.tenantId,
        );
      }
      res.json(payload);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
