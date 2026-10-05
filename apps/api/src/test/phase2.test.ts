import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { TenantStatus, MetadataVisibility } from '@vault/shared';
import { PasswordService } from '../modules/auth/services/password.service.js';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { UserRepository } from '../modules/users/repositories/user.repository.js';
import { TenantUserService } from '../modules/users/services/tenant-user.service.js';
import { RoleRepository } from '../modules/roles/repositories/role.repository.js';

const BASE = 'vault.elvatech.in';
const tenantAHost = `elva.${BASE}`;
const tenantBHost = `abc.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

function hostHeader(host: string): Record<string, string> {
  return { 'X-Vault-Host': host };
}

describe('Phase 2 — applications and environments', () => {
  let app: Application;
  let cookieA: string;
  let cookieB: string;
  let tenantAId: string;
  let tenantBId: string;
  let userBId: string;
  let appAId: string;
  let appBId: string;
  let envAId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const tenantAdmin = new TenantAdminService();
    const passwords = new PasswordService();
    const users = new UserRepository();

    const tenantA = await tenantAdmin.createTenant({
      name: 'ELVA',
      slug: 'elva',
      businessAdmin: { email: 'p2-admin-a@test.local', password, displayName: 'Admin A' },
    });
    tenantAId = tenantA.id;
    await tenantAdmin.setTenantStatus(tenantAId, TenantStatus.ACTIVE);

    const tenantB = await tenantAdmin.createTenant({
      name: 'ABC',
      slug: 'abc',
      businessAdmin: { email: 'p2-admin-b@test.local', password, displayName: 'Admin B' },
    });
    tenantBId = tenantB.id;
    await tenantAdmin.setTenantStatus(tenantBId, TenantStatus.ACTIVE);

    const loginA = await request(app)
      .post('/api/auth/tenant/login')
      .set(hostHeader(tenantAHost))
      .send({ email: 'p2-admin-a@test.local', password });
    cookieA = loginA.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const loginB = await request(app)
      .post('/api/auth/tenant/login')
      .set(hostHeader(tenantBHost))
      .send({ email: 'p2-admin-b@test.local', password });
    cookieB = loginB.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const userB = await users.findByEmail('p2-admin-b@test.local');
    userBId = userB!._id.toString();

    const createA = await request(app)
      .post('/api/applications')
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({
        name: 'ApnaCart',
        slug: 'apnacart',
        description: 'Delivery platform',
        metadata: [
          { label: 'Technology', value: 'React, Node.js', visibility: MetadataVisibility.TENANT_VISIBLE },
        ],
      });
    appAId = createA.body.application.id;

    const createB = await request(app)
      .post('/api/applications')
      .set(hostHeader(tenantBHost))
      .set('Cookie', cookieB)
      .send({ name: 'ApnaCart B', slug: 'apnacart', description: 'Other tenant same slug' });
    appBId = createB.body.application.id;

    const envs = await request(app)
      .get(`/api/applications/${appAId}/environments`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA);
    envAId = envs.body.environments.find((e: { slug: string }) => e.slug === 'prod')?.id;
  });

  it('creates application with default environments', async () => {
    const res = await request(app)
      .get(`/api/applications/${appAId}/environments`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.environments.map((e: { slug: string }) => e.slug).sort()).toEqual([
      'dev',
      'prod',
      'stage',
      'test',
    ]);
  });

  it('rejects duplicate slug within tenant', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({ name: 'Dup', slug: 'apnacart' });
    expect(res.status).toBe(400);
  });

  it('allows same slug across tenants', async () => {
    expect(appAId).toBeTruthy();
    expect(appBId).toBeTruthy();
  });

  it('lists and updates applications', async () => {
    const list = await request(app)
      .get('/api/applications')
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA);
    expect(list.status).toBe(200);
    expect(list.body.applications.some((a: { slug: string }) => a.slug === 'apnacart')).toBe(true);

    const patch = await request(app)
      .patch(`/api/applications/${appAId}`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({ description: 'Updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.application.description).toBe('Updated');
  });

  it('creator is owner and supports manager/member flows', async () => {
    const tenantUsers = new TenantUserService();
    const roles = new RoleRepository();
    const businessRole = await roles.findTenantBusinessAdminRole(tenantAId);
    const limited = await tenantUsers.createUser(tenantAId, {
      email: 'p2-member-a@test.local',
      password,
      displayName: 'Member A',
      roleIds: [businessRole!._id.toString()],
    });

    const addManager = await request(app)
      .post(`/api/applications/${appAId}/managers`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({ userId: limited.id });
    expect(addManager.status).toBe(201);

    const crossOwner = await request(app)
      .patch(`/api/applications/${appAId}/owner`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({ ownerId: userBId });
    expect(crossOwner.status).toBe(400);
  });

  it('rejects cross-tenant application access by id', async () => {
    const res = await request(app)
      .get(`/api/applications/${appBId}`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA);
    expect(res.status).toBe(404);
    expect(res.body.application).toBeUndefined();
  });

  it('rejects cross-tenant environment access', async () => {
    const res = await request(app)
      .get(`/api/environments/${envAId}`)
      .set(hostHeader(tenantBHost))
      .set('Cookie', cookieB);
    expect(res.status).toBe(404);
  });

  it('creates custom environment and enforces slug uniqueness per application', async () => {
    const create = await request(app)
      .post(`/api/applications/${appAId}/environments`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({ name: 'UAT', slug: 'uat' });
    expect(create.status).toBe(201);

    const dup = await request(app)
      .post(`/api/applications/${appAId}/environments`)
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({ name: 'UAT2', slug: 'uat' });
    expect(dup.status).toBe(400);
  });

  it('rejects tenantId override on application APIs', async () => {
    const res = await request(app)
      .get('/api/applications')
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .query({ tenantId: tenantBId });
    expect(res.status).toBe(400);
  });

  it('denies unauthorized application create without permission', async () => {
    const roles = new RoleRepository();
    const viewOnly = await request(app)
      .post('/api/tenant/roles')
      .set(hostHeader(tenantAHost))
      .set('Cookie', cookieA)
      .send({
        name: 'AppViewer',
        permissionKeys: ['application.view'],
      });
    const tenantUsers = new TenantUserService();
    await tenantUsers.createUser(tenantAId, {
      email: 'p2-viewer@test.local',
      password,
      displayName: 'Viewer',
      roleIds: [viewOnly.body.role.id],
    });
    const login = await request(app)
      .post('/api/auth/tenant/login')
      .set(hostHeader(tenantAHost))
      .send({ email: 'p2-viewer@test.local', password });
    const viewerCookie = login.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const denied = await request(app)
      .post('/api/applications')
      .set(hostHeader(tenantAHost))
      .set('Cookie', viewerCookie)
      .send({ name: 'X', slug: 'x-app' });
    expect(denied.status).toBe(403);
  });
});
