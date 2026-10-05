import { v4 as uuidv4 } from 'uuid';
import { TenantStatus, MembershipStatus } from '@vault/shared';
import { loadEnv } from '../../../config/env.js';
import { PasswordService } from './password.service.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { UserRepository } from '../../users/repositories/user.repository.js';
import { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';
import type { TenantDocument } from '../../tenant/models/tenant.model.js';

export const SESSION_COOKIE_NAME = 'vault_session';

export type AuthContext = {
  userId: string;
  sessionId: string;
  scope: 'platform' | 'tenant';
  tenantId: string | null;
};

export class AuthService {
  constructor(
    private readonly passwords = new PasswordService(),
    private readonly sessions = new SessionRepository(),
    private readonly users = new UserRepository(),
    private readonly tenants = new TenantRepository(),
    private readonly memberships = new TenantMembershipRepository(),
  ) {}

  async loginPlatform(params: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ sessionId: string; userId: string }> {
    const user = await this.users.findByEmailWithPassword(params.email);
    if (!user || user.status !== 'ACTIVE' || !user.isPlatformSuperAdmin) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const valid = await this.passwords.verify(user.passwordHash, params.password);
    if (!valid) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const sessionId = uuidv4();
    const expiresAt = this.sessionExpiry();
    await this.sessions.create({
      sessionId,
      userId: user._id.toString(),
      tenantId: null,
      scope: 'platform',
      expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    return { sessionId, userId: user._id.toString() };
  }

  async loginTenant(params: {
    email: string;
    password: string;
    tenant: TenantDocument;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ sessionId: string; userId: string; tenantId: string }> {
    if (params.tenant.status !== TenantStatus.ACTIVE) {
      throw new AuthError('TENANT_UNAVAILABLE', 'Tenant is not available');
    }
    const user = await this.users.findByEmailWithPassword(params.email);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const membership = await this.memberships.findActiveMembership(
      params.tenant._id.toString(),
      user._id.toString(),
    );
    if (!membership) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const valid = await this.passwords.verify(user.passwordHash, params.password);
    if (!valid) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const sessionId = uuidv4();
    const expiresAt = this.sessionExpiry();
    const tenantId = params.tenant._id.toString();
    await this.sessions.create({
      sessionId,
      userId: user._id.toString(),
      tenantId,
      scope: 'tenant',
      expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    return { sessionId, userId: user._id.toString(), tenantId };
  }

  async resolveSession(sessionId: string): Promise<AuthContext | null> {
    const session = await this.sessions.findValidBySessionId(sessionId);
    if (!session) return null;
    return {
      userId: session.userId.toString(),
      sessionId: session.sessionId,
      scope: session.scope,
      tenantId: session.tenantId ? session.tenantId.toString() : null,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.terminate(sessionId);
  }

  private sessionExpiry(): Date {
    const { SESSION_TTL_SECONDS } = loadEnv();
    return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  }
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
