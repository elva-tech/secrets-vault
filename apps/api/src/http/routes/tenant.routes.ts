import { Router } from 'express';
import { z } from 'zod';
import {
  rejectClientTenantOverride,
  requireActiveTenant,
  requireTenantFromHostname,
} from '../middleware/tenant-resolution.middleware.js';
import {
  requireSession,
  requireTenantSessionMatch,
} from '../middleware/session.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { TenantUserService, TenantUserError } from '../../modules/users/services/tenant-user.service.js';
import { TenantRoleService, TenantRoleError } from '../../modules/roles/services/tenant-role.service.js';
import { TenantContextService } from '../../modules/tenant/services/tenant-context.service.js';
import { ApiError } from '../errors/api-error.js';
import { paramId } from '../utils/params.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1),
  roleIds: z.array(z.string()).min(1),
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  permissionKeys: z.array(z.string()).min(1),
  description: z.string().optional(),
});

export function createTenantRouter(): Router {
  const router = Router();
  const tenantUsers = new TenantUserService();
  const tenantRoles = new TenantRoleService();
  const tenantContext = new TenantContextService();

  router.use(
    rejectClientTenantOverride,
    requireTenantFromHostname,
    requireSession,
    requireTenantSessionMatch,
    requireActiveTenant,
  );

  router.get('/context', async (req, res) => {
    res.json({
      tenant: req.trustedTenant,
      message: 'Tenant context resolved from hostname',
    });
  });

  router.get(
    '/users',
    requirePermission('user.view'),
    async (req, res, next) => {
      try {
        const users = await tenantUsers.listUsers(req.trustedTenant!.tenantId);
        res.json({ users });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    '/users',
    requirePermission('user.create'),
    async (req, res, next) => {
      try {
        const body = createUserSchema.parse(req.body);
        const user = await tenantUsers.createUser(req.trustedTenant!.tenantId, body);
        res.status(201).json({ user });
      } catch (e) {
        if (e instanceof TenantUserError) {
          next(new ApiError(400, e.code, e.message));
          return;
        }
        next(e);
      }
    },
  );

  router.get(
    '/roles',
    requirePermission('role.view'),
    async (req, res, next) => {
      try {
        const roles = await tenantRoles.listRoles(req.trustedTenant!.tenantId);
        res.json({ roles });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    '/roles',
    requirePermission('role.create'),
    async (req, res, next) => {
      try {
        const body = createRoleSchema.parse(req.body);
        const role = await tenantRoles.createRole(req.trustedTenant!.tenantId, body);
        res.status(201).json({ role });
      } catch (e) {
        if (e instanceof TenantRoleError) {
          next(new ApiError(400, e.code, e.message));
          return;
        }
        next(e);
      }
    },
  );

  /** Tenant isolation probe — returns metadata only for matching trusted tenant */
  router.get('/metadata/:id', async (req, res, next) => {
    try {
      const record = await tenantContext.getWithinTenant(
        paramId(req.params.id),
        req.trustedTenant!.tenantId,
      );
      if (!record) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
        return;
      }
      res.json({
        tenant: {
          id: record._id.toString(),
          name: record.name,
          slug: record.slug,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
