import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/api-error.js';
import { AuthError } from '../../modules/auth/services/auth.service.js';
import { PlatformError } from '../../modules/platform/services/tenant-admin.service.js';
import { VaultDomainError } from '../../modules/vault/services/vault-domain.error.js';
import { AccessControlError } from '../../modules/access-control/services/access-control.error.js';
import { logger } from '../../config/logger.js';

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, requestId: req.requestId },
    });
    return;
  }

  if (err instanceof AuthError) {
    const status = err.code === 'INVALID_CREDENTIALS' ? 401 : 403;
    res.status(status).json({
      error: { code: err.code, message: err.message, requestId: req.requestId },
    });
    return;
  }

  if (err instanceof AccessControlError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({
      error: { code: err.code, message: err.message, requestId: req.requestId },
    });
    return;
  }

  if (err instanceof VaultDomainError) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'FILE_TOO_LARGE' ? 413 : 400;
    res.status(status).json({
      error: { code: err.code, message: err.message, requestId: req.requestId },
    });
    return;
  }

  if (err instanceof PlatformError) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({
      error: { code: err.code, message: err.message, requestId: req.requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: req.requestId,
      },
    });
    return;
  }

  logger.error('Unhandled error', { requestId: req.requestId });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: req.requestId,
    },
  });
}
