import type { Request, Response, NextFunction } from 'express';
import { TenantStatus } from '@vault/shared';
import { TenantContextService } from '../../modules/tenant/services/tenant-context.service.js';
import { ApiError } from '../errors/api-error.js';

const tenantContextService = new TenantContextService();

/** Binds trusted tenant from hostname — ignores client-supplied tenantId */
export async function requireTenantFromHostname(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const resolution = req.hostnameResolution;
  if (!resolution || resolution.kind !== 'tenant') {
    next(new ApiError(400, 'TENANT_HOST_REQUIRED', 'Tenant hostname is required'));
    return;
  }

  const trusted = await tenantContextService.resolveTrustedTenantBySlug(resolution.slug);
  if (!trusted) {
    next(new ApiError(404, 'TENANT_NOT_FOUND', 'Tenant not found'));
    return;
  }

  req.trustedTenant = trusted;
  next();
}

export async function requireActiveTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.trustedTenant) {
    next(new ApiError(400, 'TENANT_CONTEXT_MISSING', 'Tenant context missing'));
    return;
  }
  if (req.trustedTenant.status !== TenantStatus.ACTIVE) {
    next(new ApiError(403, 'TENANT_UNAVAILABLE', 'Tenant is not active'));
    return;
  }
  next();
}

export function requirePlatformHostname(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const resolution = req.hostnameResolution;
  if (!resolution || resolution.kind !== 'platform') {
    next(new ApiError(400, 'PLATFORM_HOST_REQUIRED', 'Platform hostname is required'));
    return;
  }
  next();
}

/** Reject spoofed tenant identifiers from body, query, and headers */
export function rejectClientTenantOverride(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const suspicious = [
    req.body?.tenantId,
    req.query?.tenantId,
    req.headers['x-tenant-id'],
  ].filter(Boolean);
  if (suspicious.length > 0) {
    next(new ApiError(400, 'TENANT_OVERRIDE_FORBIDDEN', 'Client tenant override is not allowed'));
    return;
  }
  next();
}
