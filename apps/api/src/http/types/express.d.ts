import type { AuthContext } from '../../modules/auth/services/auth.service.js';
import type { TrustedTenantContext } from '../../modules/tenant/services/tenant-context.service.js';
import type { TenantResolutionResult } from '../../modules/tenant/services/hostname-tenant-resolver.service.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      hostnameResolution?: TenantResolutionResult;
      auth?: AuthContext;
      trustedTenant?: TrustedTenantContext;
    }
  }
}

export {};
