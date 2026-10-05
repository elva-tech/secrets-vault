import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { TenantStatus } from '@vault/shared';
import { PasswordService } from '../modules/auth/services/password.service.js';
import { UserRepository } from '../modules/users/repositories/user.repository.js';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { TenantRepository } from '../modules/tenant/repositories/tenant.repository.js';
import { SessionRepository } from '../modules/auth/repositories/session.repository.js';
import { SESSION_COOKIE_NAME } from '../modules/auth/services/auth.service.js';
import { HostnameTenantResolverService } from '../modules/tenant/services/hostname-tenant-resolver.service.js';

const BASE = 'vault.elvatech.in';
const platformHost = BASE;
const tenantAHost = `elva.${BASE}`;
const tenantBHost = `abc.${BASE}`;

function hostHeader(host: string): Record<string, string> {
  return { 'X-Vault-Host': host };
}

describe('Phase 1 security suite', () => {
  let app: Application;
  let superAdminCookie: string;
  let tenantAUserCookie: string;
  let tenantAId: string;
  let tenantBId: string;
  const password = 'Str0ngP@ssw0rd!';

  beforeAll(async () => {
    app = await createTestApp();

    const passwords = new PasswordService();
    const users = new UserRepository();
    const hash = await passwords.hash(password);
    await users.create({
      email: 'super@test.local',
      passwordHash: hash,
      displayName: 'Super',
      isPlatformSuperAdmin: true,
    });

    const loginSuper = await request(app)
      .post('/api/auth/platform/login')
      .set(hostHeader(platformHost))
      .send({ email: 'super@test.local', password });
    superAdminCookie = loginSuper.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const tenantAdmin = new TenantAdminService();
    const tenantA = await tenantAdmin.createTenant({
      name: 'ELVA',
      slug: 'elva',
      businessAdmin: {
        email: 'admin-elva@test.local',
        password,
        displayName: 'Elva Admin',
      },
    });
    tenantAId = tenantA.id;
    await tenantAdmin.setTenantStatus(tenantAId, TenantStatus.ACTIVE);

    const tenantB = await tenantAdmin.createTenant({
      name: 'ABC Corp',
      slug: 'abc',
      businessAdmin: {
        email: 'admin-abc@test.local',
        password,
        displayName: 'ABC Admin',
      },
    });
    tenantBId = tenantB.id;
    await tenantAdmin.setTenantStatus(tenantBId, TenantStatus.ACTIVE);

    const loginA = await request(app)
      .post('/api/auth/tenant/login')
      .set(hostHeader(tenantAHost))
      .send({ email: 'admin-elva@test.local', password });
    tenantAUserCookie = loginA.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  it('Test 2 — hostname resolution', () => {
    const resolver = new HostnameTenantResolverService(BASE);
    expect(resolver.resolve(`elva.${BASE}`)).toMatchObject({ kind: 'tenant', slug: 'elva' });
    expect(resolver.resolve(`abc.${BASE}`)).toMatchObject({ kind: 'tenant', slug: 'abc' });
    expect(resolver.resolve(`unknown.${BASE}`).kind).toBe('tenant');
    expect(resolver.resolve(`bad.${BASE}.extra`).kind).toBe('invalid');
  });

  it('Test 1 — tenant isolation on metadata endpoint', async () => {
    const res = await request(app)
      .get(`/api/tenant/metadata/${tenantBId}`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie);
    expect(res.status).toBe(404);
    expect(res.body?.tenant?.slug).toBeUndefined();
  });

  it('Test 3 — membership validation across hostnames', async () => {
    const res = await request(app)
      .get('/api/tenant/context')
      .set(hostHeader(tenantBHost))
      .set('Cookie', tenantAUserCookie);
    expect(res.status).toBe(403);
  });

  it('Test 4 — tenant spoofing via body/query/header', async () => {
    const resBody = await request(app)
      .get('/api/tenant/users')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie)
      .send({ tenantId: tenantBId });
    expect(resBody.status).toBe(400);

    const resQuery = await request(app)
      .get(`/api/tenant/users?tenantId=${tenantBId}`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie);
    expect(resQuery.status).toBe(400);

    const resHeader = await request(app)
      .get('/api/tenant/users')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie)
      .set('X-Tenant-Id', tenantBId);
    expect(resHeader.status).toBe(400);
  });

  it('Test 5 — disabled tenant cannot use tenant APIs', async () => {
    const tenants = new TenantRepository();
    const pending = await tenants.findBySlug('elva');
    await tenants.updateStatus(pending!._id.toString(), TenantStatus.SUSPENDED);

    const res = await request(app)
      .get('/api/tenant/context')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie);
    expect(res.status).toBe(403);

    await tenants.updateStatus(pending!._id.toString(), TenantStatus.ACTIVE);
  });

  it('Test 6 — SUPER_ADMIN and BUSINESS_ADMIN are distinct', async () => {
    const rolesRes = await request(app)
      .get('/api/tenant/roles')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie);
    expect(rolesRes.status).toBe(200);
    const builtIn = rolesRes.body.roles.find((r: { builtInKey: string }) => r.builtInKey === 'BUSINESS_ADMIN');
    expect(builtIn).toBeTruthy();

    const platformRes = await request(app)
      .get('/api/platform/tenants')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie);
    expect(platformRes.status).toBe(400);

    const platformOk = await request(app)
      .get('/api/platform/tenants')
      .set(hostHeader(platformHost))
      .set('Cookie', superAdminCookie);
    expect(platformOk.status).toBe(200);
  });

  it('Test 7 — no super admin secret bypass endpoints', async () => {
    const res = await request(app)
      .get('/api/platform/tenants')
      .set(hostHeader(platformHost))
      .set('Cookie', superAdminCookie);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/secret\.reveal|plaintext|passwordHash/i);
    expect(res.body.tenants?.[0]?.secrets).toBeUndefined();
  });

  it('Test 9 — RBAC denies unauthorized tenant user listing without permission', async () => {
    const customRole = await request(app)
      .post('/api/tenant/roles')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie)
      .send({
        name: 'ReadOnlyNoUsers',
        permissionKeys: ['role.view'],
      });
    expect(customRole.status).toBe(201);

    await request(app)
      .post('/api/tenant/users')
      .set(hostHeader(tenantAHost))
      .set('Cookie', tenantAUserCookie)
      .send({
        email: 'limited@test.local',
        password,
        displayName: 'Limited User',
        roleIds: [customRole.body.role.id],
      });

    const loginLimited = await request(app)
      .post('/api/auth/tenant/login')
      .set(hostHeader(tenantAHost))
      .send({ email: 'limited@test.local', password });
    const limitedCookie = loginLimited.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const denied = await request(app)
      .get('/api/tenant/users')
      .set(hostHeader(tenantAHost))
      .set('Cookie', limitedCookie);
    expect(denied.status).toBe(403);
  });

  it('Test 8 — invalid/expired/terminated sessions', async () => {
    const bad = await request(app)
      .get('/api/auth/me')
      .set(hostHeader(tenantAHost))
      .set('Cookie', `${SESSION_COOKIE_NAME}=not-a-real-session`);
    expect(bad.status).toBe(401);

    const freshLogin = await request(app)
      .post('/api/auth/tenant/login')
      .set(hostHeader(tenantAHost))
      .send({ email: 'admin-elva@test.local', password });
    const freshCookie = freshLogin.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const sessions = new SessionRepository();
    const sessionId = freshCookie.replace(`${SESSION_COOKIE_NAME}=`, '');
    await sessions.terminate(sessionId);

    const terminated = await request(app)
      .get('/api/tenant/context')
      .set(hostHeader(tenantAHost))
      .set('Cookie', freshCookie);
    expect(terminated.status).toBe(401);
  });
});
