import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { VaultItemType } from '@vault/shared';
import { createTenantApiRouter } from '../middleware/tenant-api.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { paramId } from '../utils/params.js';
import { PersonalVaultService } from '../../modules/personal-vault/services/personal-vault.service.js';
import { VaultDomainError } from '../../modules/vault/services/vault-domain.error.js';
import { ApiError } from '../errors/api-error.js';
import { getAuditService } from '../../modules/audit/audit-register.js';
import { AuditAction, AuditResult } from '@vault/shared';
import { auditContextFromRequest } from '../utils/audit-request.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function mapVaultError(err: unknown, next: (e: unknown) => void) {
  if (err instanceof VaultDomainError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
    next(new ApiError(status, err.code, err.message));
    return;
  }
  next(err);
}

export function createPersonalVaultRouter(): Router {
  const router = createTenantApiRouter();
  const vault = new PersonalVaultService();
  const audit = getAuditService();

  router.get('/secrets', requirePermission('personal.secret.view'), async (req, res, next) => {
    try {
      const userId = req.auth!.userId;
      const secrets = await vault.listSecrets(req.trustedTenant!.tenantId, userId);
      res.json({ secrets });
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.post('/secrets', requirePermission('personal.secret.create'), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).max(200),
          type: z.nativeEnum(VaultItemType),
          description: z.string().max(2000).optional(),
          value: z.union([
            z.object({ key: z.string(), value: z.string() }),
            z.object({ username: z.string().optional(), password: z.string() }),
            z.object({ value: z.string() }),
          ]),
        })
        .parse(req.body);
      const userId = req.auth!.userId;
      const created = await vault.createSecret(req.trustedTenant!.tenantId, userId, {
        name: body.name,
        type: body.type,
        description: body.description,
        value: body.value as never,
      });
      await audit.record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: userId,
        action: AuditAction.PERSONAL_SECRET_CREATED,
        result: AuditResult.ALLOWED,
        resourceType: 'PERSONAL_SECRET',
        resourceId: created.id,
        resourceName: created.name,
        ...auditContextFromRequest(req),
      });
      res.status(201).json({ secret: created });
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.post('/secrets/:secretId/reveal', requirePermission('personal.secret.reveal'), async (req, res, next) => {
    try {
      const userId = req.auth!.userId;
      const secretId = paramId(req.params.secretId);
      const revealed = await vault.revealSecret(req.trustedTenant!.tenantId, userId, secretId);
      await audit.record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: userId,
        action: AuditAction.PERSONAL_SECRET_REVEALED,
        result: AuditResult.ALLOWED,
        resourceType: 'PERSONAL_SECRET',
        resourceId: secretId,
        ...auditContextFromRequest(req),
      });
      res.json(revealed);
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.patch('/secrets/:secretId', requirePermission('personal.secret.edit'), async (req, res, next) => {
    try {
      const body = z
        .object({
          value: z.union([
            z.object({ key: z.string(), value: z.string() }),
            z.object({ username: z.string().optional(), password: z.string() }),
            z.object({ value: z.string() }),
          ]),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const userId = req.auth!.userId;
      const updated = await vault.updateSecret(req.trustedTenant!.tenantId, userId, paramId(req.params.secretId), {
        value: body.value as never,
        reason: body.reason,
      });
      res.json({ secret: updated });
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.delete('/secrets/:secretId', requirePermission('personal.secret.delete'), async (req, res, next) => {
    try {
      const userId = req.auth!.userId;
      const secretId = paramId(req.params.secretId);
      const deleted = await vault.deleteSecret(req.trustedTenant!.tenantId, userId, secretId);
      await audit.record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: userId,
        action: AuditAction.PERSONAL_SECRET_DELETED,
        result: AuditResult.ALLOWED,
        resourceType: 'PERSONAL_SECRET',
        resourceId: secretId,
        ...auditContextFromRequest(req),
      });
      res.json(deleted);
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.get('/files', requirePermission('personal.file.view'), async (req, res, next) => {
    try {
      const files = await vault.listFiles(req.trustedTenant!.tenantId, req.auth!.userId);
      res.json({ files });
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.post('/files', requirePermission('personal.file.upload'), upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError(400, 'INVALID_FILE', 'File required');
      const name = (req.body.name as string) || req.file.originalname;
      const userId = req.auth!.userId;
      const file = await vault.uploadFile(req.trustedTenant!.tenantId, userId, {
        name,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
      await audit.record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: userId,
        action: AuditAction.PERSONAL_FILE_UPLOADED,
        result: AuditResult.ALLOWED,
        resourceType: 'PERSONAL_FILE',
        resourceId: file.id,
        resourceName: file.name,
        ...auditContextFromRequest(req),
      });
      res.status(201).json({ file });
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.get('/files/:fileId/download', requirePermission('personal.file.download'), async (req, res, next) => {
    try {
      const userId = req.auth!.userId;
      const fileId = paramId(req.params.fileId);
      const downloaded = await vault.downloadFile(req.trustedTenant!.tenantId, userId, fileId);
      await audit.record({
        tenantId: req.trustedTenant!.tenantId,
        actorId: userId,
        action: AuditAction.PERSONAL_FILE_DOWNLOADED,
        result: AuditResult.ALLOWED,
        resourceType: 'PERSONAL_FILE',
        resourceId: fileId,
        ...auditContextFromRequest(req),
      });
      res.setHeader('Content-Type', downloaded.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloaded.filename}"`);
      res.send(downloaded.buffer);
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  router.delete('/files/:fileId', requirePermission('personal.file.delete'), async (req, res, next) => {
    try {
      const userId = req.auth!.userId;
      const deleted = await vault.deleteFile(req.trustedTenant!.tenantId, userId, paramId(req.params.fileId));
      res.json(deleted);
    } catch (e) {
      mapVaultError(e, next);
    }
  });

  return router;
}
