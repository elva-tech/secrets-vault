import { Router } from 'express';
import { z } from 'zod';
import { createTenantApiRouter } from '../middleware/tenant-api.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { paramId } from '../utils/params.js';
import { AuditService } from '../../modules/audit/services/audit.service.js';

export function createAuditRouter(): Router {
  const router = createTenantApiRouter();
  const audit = new AuditService();

  router.get('/audit/logs', requirePermission('audit.view'), async (req, res, next) => {
    try {
      const query = z
        .object({
          action: z.string().optional(),
          actorId: z.string().optional(),
          resourceType: z.string().optional(),
          applicationId: z.string().optional(),
          environmentId: z.string().optional(),
          result: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          page: z.coerce.number().min(1).default(1),
          limit: z.coerce.number().min(1).max(100).default(25),
        })
        .parse(req.query);
      const result = await audit.list(req.trustedTenant!.tenantId, {
        ...query,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.get('/audit/logs/:logId', requirePermission('audit.view'), async (req, res, next) => {
    try {
      const row = await audit.getById(req.trustedTenant!.tenantId, paramId(req.params.logId));
      if (!row) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audit log not found' } });
        return;
      }
      res.json({ log: row });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
