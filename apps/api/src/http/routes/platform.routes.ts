import { Router } from 'express';
import { z } from 'zod';
import { TenantStatus } from '@vault/shared';
import { TenantAdminService } from '../../modules/platform/services/tenant-admin.service.js';
import {
  requirePlatformHostname,
  rejectClientTenantOverride,
} from '../middleware/tenant-resolution.middleware.js';
import {
  requirePlatformSession,
  requireSession,
} from '../middleware/session.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { paramId } from '../utils/params.js';

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  plan: z.string().optional(),
  businessAdmin: z.object({
    email: z.string().email(),
    password: z.string().min(12),
    displayName: z.string().min(1),
  }),
});

const statusSchema = z.object({
  status: z.enum([
    TenantStatus.ACTIVE,
    TenantStatus.SUSPENDED,
    TenantStatus.DISABLED,
    TenantStatus.PENDING,
  ]),
});

export function createPlatformRouter(): Router {
  const router = Router();
  const tenantAdmin = new TenantAdminService();

  router.use(rejectClientTenantOverride, requirePlatformHostname, requireSession, requirePlatformSession);

  router.get('/tenants', requirePermission('platform.tenant.view'), async (_req, res, next) => {
    try {
      const tenants = await tenantAdmin.listTenants();
      res.json({ tenants });
    } catch (e) {
      next(e);
    }
  });

  router.post('/tenants', requirePermission('platform.tenant.create'), async (req, res, next) => {
    try {
      const body = createTenantSchema.parse(req.body);
      const tenant = await tenantAdmin.createTenant(body);
      res.status(201).json({ tenant });
    } catch (e) {
      next(e);
    }
  });

  router.get('/tenants/:id', requirePermission('platform.tenant.view'), async (req, res, next) => {
    try {
      const tenant = await tenantAdmin.getTenantById(paramId(req.params.id));
      if (!tenant) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        return;
      }
      res.json({ tenant });
    } catch (e) {
      next(e);
    }
  });

  router.patch(
    '/tenants/:id/status',
    requirePermission('platform.tenant.update'),
    async (req, res, next) => {
      try {
        const body = statusSchema.parse(req.body);
        const permission =
          body.status === TenantStatus.ACTIVE
            ? 'platform.tenant.activate'
            : body.status === TenantStatus.SUSPENDED
              ? 'platform.tenant.suspend'
              : body.status === TenantStatus.DISABLED
                ? 'platform.tenant.disable'
                : 'platform.tenant.update';
        // Additional permission check handled by requirePermission on update;
        // status-specific keys are included in SUPER_ADMIN role.
        const tenant = await tenantAdmin.setTenantStatus(paramId(req.params.id), body.status);
        res.json({ tenant, appliedPermission: permission });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
