import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { AuthService, SESSION_COOKIE_NAME } from '../../modules/auth/services/auth.service.js';
import { ApiError } from '../errors/api-error.js';
import { loadEnv } from '../../config/env.js';

const authService = new AuthService();

export const cookieParserMiddleware = cookieParser();

export async function optionalSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!sessionId) {
    next();
    return;
  }
  const auth = await authService.resolveSession(sessionId);
  if (auth) {
    req.auth = auth;
  }
  next();
}

export async function requireSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!sessionId) {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
    return;
  }
  const auth = await authService.resolveSession(sessionId);
  if (!auth) {
    next(new ApiError(401, 'SESSION_INVALID', 'Session is invalid or expired'));
    return;
  }
  req.auth = auth;
  next();
}

export function requirePlatformSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth || req.auth.scope !== 'platform') {
    next(new ApiError(403, 'PLATFORM_SESSION_REQUIRED', 'Platform session required'));
    return;
  }
  next();
}

export function requireTenantSessionMatch(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth || req.auth.scope !== 'tenant') {
    next(new ApiError(401, 'TENANT_SESSION_REQUIRED', 'Tenant session required'));
    return;
  }
  if (!req.trustedTenant) {
    next(new ApiError(400, 'TENANT_CONTEXT_MISSING', 'Tenant context missing'));
    return;
  }
  if (req.auth.tenantId !== req.trustedTenant.tenantId) {
    next(new ApiError(403, 'TENANT_MEMBERSHIP_MISMATCH', 'Not a member of this tenant'));
    return;
  }
  next();
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
  path: string;
} {
  const env = loadEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.SESSION_COOKIE_SAMESITE,
    maxAge: env.SESSION_TTL_SECONDS * 1000,
    path: '/',
  };
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  const opts = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: opts.path,
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
  });
}
