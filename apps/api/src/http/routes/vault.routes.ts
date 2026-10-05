import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuditAction, AuditResult, RotationType, VaultItemType } from '@vault/shared';
import { AuthorizationDecision } from '@vault/shared';
import { createTenantApiRouter } from '../middleware/tenant-api.middleware.js';
import { paramId } from '../utils/params.js';
import { ApiError } from '../errors/api-error.js';
import { VaultSecretService } from '../../modules/vault/services/vault-secret.service.js';
import { VaultFileService } from '../../modules/vault/services/vault-file.service.js';
import { VaultDomainError } from '../../modules/vault/services/vault-domain.error.js';
import { VaultAccessService } from '../../modules/vault/services/vault-access.service.js';
import { AuthorizationService } from '../../modules/access-control/authorization.service.js';
import { RotationService } from '../../modules/vault/services/rotation.service.js';
import { getAuditService } from '../../modules/audit/audit-register.js';
import { auditContextFromRequest } from '../utils/audit-request.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleVaultError(err: unknown, next: (e: unknown) => void) {
  if (err instanceof VaultDomainError) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN'
          ? 403
          : err.code === 'FILE_TOO_LARGE'
            ? 413
            : 400;
    next(new ApiError(status, err.code, err.message));
    return;
  }
  next(err);
}

async function assertVaultPermission(
  permission: string,
  req: Request,
  options?: {
    resource?: { id: string; tenantId: string; type: 'SECRET' | 'FILE' };
    sensitive?: boolean;
  },
): Promise<void> {
  if (!req.auth || !req.trustedTenant) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  const vaultAccess = new VaultAccessService();
  if (!options?.resource) {
    const rbac = new AuthorizationService();
    const decision = await rbac.authorize({
      userId: req.auth.userId,
      tenantId: req.trustedTenant.tenantId,
      permission,
    });
    if (decision !== AuthorizationDecision.ALLOW) {
      throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    return;
  }
  const result = await vaultAccess.authorizeVaultOperation({
    userId: req.auth.userId,
    tenantId: req.trustedTenant.tenantId,
    permission,
    resourceType: options.resource.type,
    resourceId: options.resource.id,
    sensitive: options.sensitive ?? false,
  });
  if (result.reason === 'NOT_FOUND') {
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  }
  if (result.decision === AuthorizationDecision.APPROVAL_REQUIRED) {
    throw new ApiError(403, 'APPROVAL_REQUIRED', 'Approval required for this operation');
  }
  if (result.decision !== AuthorizationDecision.ALLOW) {
    throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
}

const createSecretSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.nativeEnum(VaultItemType),
  description: z.string().max(2000).optional(),
  ownerId: z.string().optional(),
  value: z.union([
    z.object({ key: z.string(), value: z.string() }),
    z.object({ username: z.string().optional(), password: z.string() }),
    z.object({ value: z.string() }),
  ]),
});

export function createVaultRouter(): Router {
  const router = createTenantApiRouter();
  const secrets = new VaultSecretService();
  const files = new VaultFileService();

  router.get(
    '/applications/:applicationId/environments/:environmentId/secrets',
    async (req, res, next) => {
      try {
        await assertVaultPermission('secret.view', req);
        const items = await secrets.listByEnvironment(
          req.trustedTenant!.tenantId,
          paramId(req.params.environmentId),
          paramId(req.params.applicationId),
        );
        res.json({ secrets: items });
      } catch (e) {
        handleVaultError(e, next);
      }
    },
  );

  router.post(
    '/applications/:applicationId/environments/:environmentId/secrets',
    async (req, res, next) => {
      try {
        await assertVaultPermission('secret.create', req);
        const body = createSecretSchema.parse(req.body);
        const created = await secrets.create(
          req.trustedTenant!.tenantId,
          paramId(req.params.environmentId),
          paramId(req.params.applicationId),
          req.auth!.userId,
          {
            name: body.name,
            type: body.type,
            description: body.description,
            ownerId: body.ownerId,
            value: { type: body.type, ...body.value } as never,
          },
        );
        res.status(201).json({ secret: created });
      } catch (e) {
        handleVaultError(e, next);
      }
    },
  );

  router.get('/secrets/:secretId', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.view', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
      });
      const secret = await secrets.getMetadata(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
      );
      res.json({ secret });
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.patch('/secrets/:secretId', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.edit', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
      });
      const body = z
        .object({
          value: createSecretSchema.shape.value,
          type: z.nativeEnum(VaultItemType).optional(),
          reason: z.string().optional(),
          description: z.string().optional(),
          name: z.string().optional(),
        })
        .parse(req.body);
      const meta = await secrets.getMetadata(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
      );
      const updated = await secrets.updateValue(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
        req.auth!.userId,
        {
          value: { type: meta.type as VaultItemType, ...body.value } as never,
          reason: body.reason,
          description: body.description,
          name: body.name,
        },
      );
      res.json({ secret: updated });
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.delete('/secrets/:secretId', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.delete', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
      });
      const result = await secrets.delete(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
        req.auth!.userId,
      );
      res.json(result);
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.post('/secrets/:secretId/reveal', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.reveal', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
        sensitive: true,
      });
      const secretId = paramId(req.params.secretId);
      const payload = await secrets.reveal(req.trustedTenant!.tenantId, secretId, req.auth!.userId);
      const meta = await secrets.getMetadata(req.trustedTenant!.tenantId, secretId);
      await getAuditService().record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: req.auth!.userId,
        action: AuditAction.SECRET_REVEALED,
        result: AuditResult.ALLOWED,
        resourceType: 'SECRET',
        resourceId: secretId,
        resourceName: meta.name,
        applicationId: meta.applicationId ?? undefined,
        environmentId: meta.environmentId ?? undefined,
        ...auditContextFromRequest(req),
      });
      res.json(payload);
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.post('/secrets/:secretId/copy', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.copy', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
        sensitive: true,
      });
      const secretId = paramId(req.params.secretId);
      const payload = await secrets.copy(req.trustedTenant!.tenantId, secretId, req.auth!.userId);
      const meta = await secrets.getMetadata(req.trustedTenant!.tenantId, secretId);
      await getAuditService().record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: req.auth!.userId,
        action: AuditAction.SECRET_COPIED,
        result: AuditResult.ALLOWED,
        resourceType: 'SECRET',
        resourceId: secretId,
        resourceName: meta.name,
        applicationId: meta.applicationId ?? undefined,
        environmentId: meta.environmentId ?? undefined,
        ...auditContextFromRequest(req),
      });
      res.json(payload);
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.get('/secrets/:secretId/versions', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.view', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
      });
      const versions = await secrets.listVersions(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
      );
      res.json({ versions });
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.get(
    '/applications/:applicationId/environments/:environmentId/files',
    async (req, res, next) => {
      try {
        await assertVaultPermission('file.view', req);
        const items = await files.listByEnvironment(
          req.trustedTenant!.tenantId,
          paramId(req.params.environmentId),
          paramId(req.params.applicationId),
        );
        res.json({ files: items });
      } catch (e) {
        handleVaultError(e, next);
      }
    },
  );

  router.post(
    '/applications/:applicationId/environments/:environmentId/files',
    upload.single('file'),
    async (req, res, next) => {
      try {
        await assertVaultPermission('file.upload', req);
        if (!req.file) {
          next(new ApiError(400, 'INVALID_FILE', 'File is required'));
          return;
        }
        const name = (req.body.name as string) || req.file.originalname;
        const created = await files.upload(
          req.trustedTenant!.tenantId,
          paramId(req.params.environmentId),
          paramId(req.params.applicationId),
          req.auth!.userId,
          {
            name,
            originalFilename: req.file.originalname,
            mimeType: req.file.mimetype,
            buffer: req.file.buffer,
          },
        );
        res.status(201).json({ file: created });
      } catch (e) {
        handleVaultError(e, next);
      }
    },
  );

  router.get('/files/:fileId/download', async (req, res, next) => {
    try {
      await assertVaultPermission('file.download', req, {
        resource: {
          id: paramId(req.params.fileId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'FILE',
        },
        sensitive: true,
      });
      const fileId = paramId(req.params.fileId);
      const file = await files.download(req.trustedTenant!.tenantId, fileId);
      await getAuditService().record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: req.auth!.userId,
        action: AuditAction.FILE_DOWNLOADED,
        result: AuditResult.ALLOWED,
        resourceType: 'FILE',
        resourceId: fileId,
        ...auditContextFromRequest(req),
      });
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.buffer);
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.delete('/files/:fileId', async (req, res, next) => {
    try {
      await assertVaultPermission('file.delete', req, {
        resource: {
          id: paramId(req.params.fileId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'FILE',
        },
      });
      const result = await files.delete(
        req.trustedTenant!.tenantId,
        paramId(req.params.fileId),
        req.auth!.userId,
      );
      res.json(result);
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  const rotation = new RotationService();

  router.patch('/secrets/:secretId/rotation', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.edit', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
      });
      const body = z
        .object({
          rotationType: z.nativeEnum(RotationType),
          customRotationDate: z.string().datetime().optional(),
        })
        .parse(req.body);
      const updated = await rotation.updateRotationPolicy(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
        req.auth!.userId,
        body,
      );
      res.json(updated);
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  router.post('/secrets/:secretId/rotate', async (req, res, next) => {
    try {
      await assertVaultPermission('secret.rotate', req, {
        resource: {
          id: paramId(req.params.secretId),
          tenantId: req.trustedTenant!.tenantId,
          type: 'SECRET',
        },
        sensitive: true,
      });
      const body = z
        .object({
          value: z.union([
            z.object({ key: z.string(), value: z.string() }),
            z.object({ username: z.string().optional(), password: z.string() }),
            z.object({ value: z.string() }),
          ]),
        })
        .parse(req.body);
      const meta = await rotation.rotateNow(
        req.trustedTenant!.tenantId,
        paramId(req.params.secretId),
        req.auth!.userId,
        { value: body.value as never, requestId: req.requestId },
      );
      res.json({ secret: meta });
    } catch (e) {
      handleVaultError(e, next);
    }
  });

  return router;
}
