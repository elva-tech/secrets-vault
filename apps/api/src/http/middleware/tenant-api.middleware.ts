import { Router } from 'express';
import {
  rejectClientTenantOverride,
  requireActiveTenant,
  requireTenantFromHostname,
} from './tenant-resolution.middleware.js';
import {
  requireSession,
  requireTenantSessionMatch,
} from './session.middleware.js';

/** Standard Phase 1 tenant API stack for hostname-bound tenant sessions */
export function createTenantApiRouter(): Router {
  const router = Router();
  router.use(
    rejectClientTenantOverride,
    requireTenantFromHostname,
    requireSession,
    requireTenantSessionMatch,
    requireActiveTenant,
  );
  return router;
}
