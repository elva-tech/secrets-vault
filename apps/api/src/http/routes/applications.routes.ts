import { Router } from 'express';
import { z } from 'zod';
import {
  ApplicationStatus,
  EnvironmentStatus,
  MetadataVisibility,
  type ApplicationMetadataItem,
} from '@vault/shared';
import { createTenantApiRouter } from '../middleware/tenant-api.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { paramId } from '../utils/params.js';
import { ApplicationService } from '../../modules/applications/services/application.service.js';
import { EnvironmentService } from '../../modules/environments/services/environment.service.js';
import { ApplicationDomainError } from '../../modules/applications/services/tenant-user-validation.service.js';
import { ApiError } from '../errors/api-error.js';

const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);

const metadataSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.string().max(5000),
  visibility: z.nativeEnum(MetadataVisibility).optional(),
  restrictedRoleIds: z.array(z.string()).optional(),
});

const createApplicationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(2000).optional(),
  ownerId: z.string().optional(),
  metadata: z.array(metadataSchema).optional(),
  seedDefaultEnvironments: z.boolean().optional(),
});

const updateApplicationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  metadata: z.array(metadataSchema).optional(),
  status: z.nativeEnum(ApplicationStatus).optional(),
});

const createEnvironmentSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-_]*[a-z0-9])?$/),
  description: z.string().max(2000).optional(),
});

function handleDomainError(err: unknown, next: (e: unknown) => void) {
  if (err instanceof ApplicationDomainError) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    next(new ApiError(status, err.code, err.message));
    return;
  }
  next(err);
}

export function createApplicationsRouter(): Router {
  const router = createTenantApiRouter();
  const applications = new ApplicationService();
  const environments = new EnvironmentService();

  router.get('/', requirePermission('application.view'), async (req, res, next) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const items = await applications.list(
        req.trustedTenant!.tenantId,
        req.auth!.userId,
        search,
      );
      res.json({ applications: items });
    } catch (e) {
      handleDomainError(e, next);
    }
  });

  router.post('/', requirePermission('application.create'), async (req, res, next) => {
    try {
      const body = createApplicationSchema.parse(req.body);
      const app = await applications.create(
        req.trustedTenant!.tenantId,
        req.auth!.userId,
        {
          ...body,
          metadata: body.metadata as ApplicationMetadataItem[] | undefined,
        },
      );
      res.status(201).json({ application: app });
    } catch (e) {
      handleDomainError(e, next);
    }
  });

  router.get('/:applicationId', requirePermission('application.view'), async (req, res, next) => {
    try {
      const app = await applications.getById(
        req.trustedTenant!.tenantId,
        paramId(req.params.applicationId),
        req.auth!.userId,
      );
      res.json({ application: app });
    } catch (e) {
      handleDomainError(e, next);
    }
  });

  router.patch('/:applicationId', requirePermission('application.edit'), async (req, res, next) => {
    try {
      const body = updateApplicationSchema.parse(req.body);
      const app = await applications.update(
        req.trustedTenant!.tenantId,
        paramId(req.params.applicationId),
        req.auth!.userId,
        {
          ...body,
          metadata: body.metadata as ApplicationMetadataItem[] | undefined,
        },
      );
      res.json({ application: app });
    } catch (e) {
      handleDomainError(e, next);
    }
  });

  router.delete(
    '/:applicationId',
    requirePermission('application.delete'),
    async (req, res, next) => {
      try {
        const result = await applications.delete(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          req.auth!.userId,
        );
        res.json(result);
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.get(
    '/:applicationId/members',
    requirePermission('application.view'),
    async (req, res, next) => {
      try {
        const members = await applications.listMembers(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
        );
        res.json({ members });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.post(
    '/:applicationId/members',
    requirePermission('application.edit'),
    async (req, res, next) => {
      try {
        const body = z.object({ userId: z.string() }).parse(req.body);
        const members = await applications.addMember(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          body.userId,
        );
        res.status(201).json({ members });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.delete(
    '/:applicationId/members/:userId',
    requirePermission('application.edit'),
    async (req, res, next) => {
      try {
        const members = await applications.removeMember(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          paramId(req.params.userId),
        );
        res.json({ members });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.post(
    '/:applicationId/managers',
    requirePermission('application.edit'),
    async (req, res, next) => {
      try {
        const body = z.object({ userId: z.string() }).parse(req.body);
        const members = await applications.addManager(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          req.auth!.userId,
          body.userId,
        );
        res.status(201).json({ members });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.delete(
    '/:applicationId/managers/:userId',
    requirePermission('application.edit'),
    async (req, res, next) => {
      try {
        const members = await applications.removeManager(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          paramId(req.params.userId),
        );
        res.json({ members });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.patch(
    '/:applicationId/owner',
    requirePermission('application.edit'),
    async (req, res, next) => {
      try {
        const body = z.object({ ownerId: z.string() }).parse(req.body);
        const app = await applications.changeOwner(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          req.auth!.userId,
          body.ownerId,
        );
        res.json({ application: app });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.get(
    '/:applicationId/environments',
    requirePermission('environment.view'),
    async (req, res, next) => {
      try {
        const items = await environments.listByApplication(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
        );
        res.json({ environments: items });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  router.post(
    '/:applicationId/environments',
    requirePermission('environment.create'),
    async (req, res, next) => {
      try {
        const body = createEnvironmentSchema.parse(req.body);
        const env = await environments.create(
          req.trustedTenant!.tenantId,
          paramId(req.params.applicationId),
          req.auth!.userId,
          body,
        );
        res.status(201).json({ environment: env });
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  return router;
}

export function createEnvironmentsRouter(): Router {
  const router = createTenantApiRouter();
  const environments = new EnvironmentService();

  router.get('/:environmentId', requirePermission('environment.view'), async (req, res, next) => {
    try {
      const env = await environments.getById(
        req.trustedTenant!.tenantId,
        paramId(req.params.environmentId),
      );
      res.json({ environment: env });
    } catch (e) {
      handleDomainError(e, next);
    }
  });

  router.patch('/:environmentId', requirePermission('environment.edit'), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(2000).optional(),
          status: z.nativeEnum(EnvironmentStatus).optional(),
        })
        .parse(req.body);
      const env = await environments.update(
        req.trustedTenant!.tenantId,
        paramId(req.params.environmentId),
        req.auth!.userId,
        body,
      );
      res.json({ environment: env });
    } catch (e) {
      handleDomainError(e, next);
    }
  });

  router.delete(
    '/:environmentId',
    requirePermission('environment.delete'),
    async (req, res, next) => {
      try {
        const result = await environments.delete(
          req.trustedTenant!.tenantId,
          paramId(req.params.environmentId),
          req.auth!.userId,
        );
        res.json(result);
      } catch (e) {
        handleDomainError(e, next);
      }
    },
  );

  return router;
}
