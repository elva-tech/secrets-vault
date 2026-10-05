import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { NonOwnerBehavior, PolicyResourceType } from '@vault/shared';
import { createTenantApiRouter } from '../middleware/tenant-api.middleware.js';
import { paramId } from '../utils/params.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { AccessRequestService } from '../../modules/access-control/services/access-request.service.js';
import { AccessPolicyService } from '../../modules/access-control/services/access-policy.service.js';
import { AccessControlError } from '../../modules/access-control/services/access-control.error.js';
import { ApiError } from '../errors/api-error.js';
import { NotificationService } from '../../modules/notifications/notification.service.js';

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function mapError(err: unknown, next: (e: unknown) => void) {
  if (err instanceof AccessControlError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
    next(new ApiError(status, err.code, err.message));
    return;
  }
  next(err);
}

export function createAccessControlRouter(): Router {
  const router = createTenantApiRouter();
  const requests = new AccessRequestService();
  const policies = new AccessPolicyService();

  router.post('/access-requests', requirePermission('access.request'), async (req, res, next) => {
    try {
      const body = z
        .object({
          applicationId: z.string(),
          environmentId: z.string(),
          resourceType: z.enum(['SECRET', 'FILE']),
          resourceIds: z.array(z.string()).min(1),
          permissions: z.array(z.string()).min(1),
          reason: z.string().min(3).max(2000),
        })
        .parse(req.body);
      const created = await requests.create({
        tenantId: req.trustedTenant!.tenantId,
        requesterId: req.auth!.userId,
        ...body,
      });
      res.status(201).json({ request: created });
    } catch (e) {
      mapError(e, next);
    }
  });

  router.get('/access-requests/mine', requirePermission('access.view'), async (req, res, next) => {
    try {
      const items = await requests.listMine(req.trustedTenant!.tenantId, req.auth!.userId);
      res.json({ requests: items });
    } catch (e) {
      mapError(e, next);
    }
  });

  router.get('/access-requests/inbox', requirePermission('access.approve'), async (req, res, next) => {
    try {
      const items = await requests.listForOwner(req.trustedTenant!.tenantId, req.auth!.userId);
      res.json({ requests: items });
    } catch (e) {
      mapError(e, next);
    }
  });

  router.post(
    '/access-requests/:requestId/approve',
    requirePermission('access.approve'),
    async (req, res, next) => {
      try {
        const updated = await requests.approve(
          req.trustedTenant!.tenantId,
          paramId(req.params.requestId),
          req.auth!.userId,
        );
        res.json({ request: updated });
      } catch (e) {
        mapError(e, next);
      }
    },
  );

  router.post(
    '/access-requests/:requestId/reject',
    requirePermission('access.reject'),
    async (req, res, next) => {
      try {
        const updated = await requests.reject(
          req.trustedTenant!.tenantId,
          paramId(req.params.requestId),
          req.auth!.userId,
        );
        res.json({ request: updated });
      } catch (e) {
        mapError(e, next);
      }
    },
  );

  router.post(
    '/access-requests/:requestId/verify-otp',
    otpVerifyLimiter,
    requirePermission('access.request'),
    async (req, res, next) => {
      try {
        const body = z.object({ code: z.string().min(4).max(12) }).parse(req.body);
        const result = await requests.verifyOtp(
          req.trustedTenant!.tenantId,
          paramId(req.params.requestId),
          req.auth!.userId,
          body.code,
        );
        res.json(result);
      } catch (e) {
        mapError(e, next);
      }
    },
  );

  router.get('/access-grants/mine', requirePermission('access.view'), async (req, res, next) => {
    try {
      const grants = await requests.listGrants(req.trustedTenant!.tenantId, req.auth!.userId);
      res.json({
        grants: grants.map((g) => ({
          id: g._id.toString(),
          applicationId: g.applicationId.toString(),
          environmentId: g.environmentId.toString(),
          resourceIds: g.resourceIds.map((id) => id.toString()),
          permissions: g.permissions,
          expiresAt: g.expiresAt,
          status: g.status,
        })),
      });
    } catch (e) {
      mapError(e, next);
    }
  });

  router.post(
    '/access-grants/:grantId/revoke',
    requirePermission('access.approve'),
    async (req, res, next) => {
      try {
        const revoked = await requests.revokeGrant(
          req.trustedTenant!.tenantId,
          paramId(req.params.grantId),
          req.auth!.userId,
        );
        res.json({ grant: revoked });
      } catch (e) {
        mapError(e, next);
      }
    },
  );

  router.get(
    '/policies/:resourceType/:resourceId',
    requirePermission('policy.view'),
    async (req, res, next) => {
      try {
        const resourceType = z.nativeEnum(PolicyResourceType).parse(req.params.resourceType);
        const policy = await policies.getPolicy(
          req.trustedTenant!.tenantId,
          resourceType,
          paramId(req.params.resourceId),
        );
        res.json({ policy });
      } catch (e) {
        mapError(e, next);
      }
    },
  );

  router.patch(
    '/policies/:resourceType/:resourceId',
    requirePermission('policy.edit'),
    async (req, res, next) => {
      try {
        const resourceType = z.nativeEnum(PolicyResourceType).parse(req.params.resourceType);
        const body = z
          .object({
            ownerAccess: z.nativeEnum(NonOwnerBehavior).optional(),
            nonOwnerBehavior: z.nativeEnum(NonOwnerBehavior).optional(),
            applicationMembersBehavior: z.nativeEnum(NonOwnerBehavior).optional(),
            grantDurationMinutes: z.number().min(5).max(24 * 60).optional(),
            allowReveal: z.boolean().optional(),
            allowCopy: z.boolean().optional(),
            allowDownload: z.boolean().optional(),
            userAccess: z
              .array(z.object({ userId: z.string(), behavior: z.nativeEnum(NonOwnerBehavior) }))
              .optional(),
            roleAccess: z
              .array(z.object({ roleId: z.string(), behavior: z.nativeEnum(NonOwnerBehavior) }))
              .optional(),
          })
          .parse(req.body);
        const updated = await policies.updatePolicy(
          req.trustedTenant!.tenantId,
          resourceType,
          paramId(req.params.resourceId),
          body,
          req.auth!.userId,
        );
        res.json({ policy: updated });
      } catch (e) {
        mapError(e, next);
      }
    },
  );

  if (process.env.NODE_ENV === 'test') {
    router.get('/test/notifications', (_req, res) => {
      res.json({ notifications: NotificationService.drainTestNotifications() });
    });
  }

  return router;
}
