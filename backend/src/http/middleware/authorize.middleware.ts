import type { Request, Response, NextFunction } from 'express';
import { AuthorizationDecision } from '@vault/shared';
import { AuthorizationService } from '../../modules/access-control/authorization.service.js';
import { ApiError } from '../errors/api-error.js';
import { paramId } from '../utils/params.js';

const authorizationService = new AuthorizationService();

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    const tenantId =
      req.trustedTenant?.tenantId ?? (req.auth.scope === 'tenant' ? req.auth.tenantId : null);

    const decision = await authorizationService.authorize({
      userId: req.auth.userId,
      tenantId,
      permission,
      resource: req.params.id
        ? { type: 'unknown', id: paramId(req.params.id), tenantId: tenantId ?? undefined }
        : undefined,
    });

    if (decision === AuthorizationDecision.DENY) {
      next(new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    if (decision === AuthorizationDecision.APPROVAL_REQUIRED) {
      next(new ApiError(403, 'APPROVAL_REQUIRED', 'Approval required'));
      return;
    }
    next();
  };
}
