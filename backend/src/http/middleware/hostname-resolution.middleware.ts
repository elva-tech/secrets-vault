import type { Request, Response, NextFunction } from 'express';
import { loadEnv } from '../../config/env.js';
import { isTrustedBrowserRequest } from '../utils/cors-origin.js';
import { HostnameTenantResolverService } from '../../modules/tenant/services/hostname-tenant-resolver.service.js';

let resolver: HostnameTenantResolverService | null = null;

function getResolver(): HostnameTenantResolverService {
  if (!resolver) {
    resolver = new HostnameTenantResolverService();
  }
  return resolver;
}

export function getRequestHostname(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  const env = loadEnv();
  const vaultHost = req.headers['x-vault-host'];
  if (typeof vaultHost === 'string' && vaultHost.trim()) {
    const trusted =
      env.NODE_ENV !== 'production' ||
      isTrustedBrowserRequest(
        typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
        typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
        env,
      );
    if (trusted) {
      return vaultHost.trim();
    }
  }
  return req.hostname;
}

export function hostnameResolutionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const hostname = getRequestHostname(req);
  req.hostnameResolution = getResolver().resolve(hostname);
  next();
}

export function getHostnameResolver(): HostnameTenantResolverService {
  return getResolver();
}
