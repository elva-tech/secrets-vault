import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { NonOwnerBehavior, PolicyResourceType, TenantStatus, VaultItemType } from '@vault/shared';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { UserRepository } from '../modules/users/repositories/user.repository.js';
import { NotificationService } from '../modules/notifications/notification.service.js';

const BASE = 'vault.elvatech.in';
const hostA = `elva.${BASE}`;
const hostB = `abc.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

describe('Phase 4 — access control', () => {
  let app: Application;
  let cookieOwner: string;
  let cookieEngineer: string;
  let cookieB: string;
  let engineerUserId: string;
  let applicationId: string;
  let environmentId: string;
  let secretId: string;
  let secretBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    NotificationService.clearTestNotifications();
    const tenantAdmin = new TenantAdminService();
    const users = new UserRepository();

    const tenantA = await tenantAdmin.createTenant({
      name: 'ELVA',
      slug: 'elva',
      businessAdmin: { email: 'p4-owner@test.local', password, displayName: 'Owner' },
    });
    await tenantAdmin.setTenantStatus(tenantA.id, TenantStatus.ACTIVE);

    const tenantB = await tenantAdmin.createTenant({
      name: 'ABC',
      slug: 'abc',
      businessAdmin: { email: 'p4-b@test.local', password, displayName: 'B' },
    });
    await tenantAdmin.setTenantStatus(tenantB.id, TenantStatus.ACTIVE);

    cookieOwner =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p4-owner@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    cookieB =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostB)
          .send({ email: 'p4-b@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const roleRes = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'VaultEngineer',
        permissionKeys: [
          'secret.view',
          'secret.reveal',
          'secret.copy',
          'access.request',
          'access.view',
        ],
      });

    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'p4-engineer@test.local',
        password,
        displayName: 'Engineer',
        roleIds: [roleRes.body.role.id],
      });

    const engineer = await users.findByEmail('p4-engineer@test.local');
    engineerUserId = engineer!._id.toString();

    cookieEngineer =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p4-engineer@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const appRes = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ name: 'ApnaCart', slug: 'apnacart-p4' });
    applicationId = appRes.body.application.id;
    environmentId = (
      await request(app)
        .get(`/api/applications/${applicationId}/environments`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
    ).body.environments.find((e: { slug: string }) => e.slug === 'prod').id;

    const createSecret = await request(app)
      .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'DATABASE_PASSWORD',
        type: VaultItemType.PASSWORD,
        value: { username: 'admin', password: 'p4-plain-secret' },
      });
    secretId = createSecret.body.secret.id;

    const appB = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostB)
      .set('Cookie', cookieB)
      .send({ name: 'Other', slug: 'other-p4' });
    const envB = (
      await request(app)
        .get(`/api/applications/${appB.body.application.id}/environments`)
        .set('X-Vault-Host', hostB)
        .set('Cookie', cookieB)
    ).body.environments[0].id;
    secretBId = (
      await request(app)
        .post(`/api/vault/applications/${appB.body.application.id}/environments/${envB}/secrets`)
        .set('X-Vault-Host', hostB)
        .set('Cookie', cookieB)
        .send({
          name: 'TOKEN',
          type: VaultItemType.TOKEN,
          value: { value: 'tenant-b' },
        })
    ).body.secret.id;
  });

  beforeEach(() => {
    NotificationService.clearTestNotifications();
  });

  it('owner can reveal without OTP', async () => {
    const res = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(res.status).toBe(200);
    expect(res.body.value.password).toBe('p4-plain-secret');
  });

  it('non-owner with permission gets APPROVAL_REQUIRED and no plaintext', async () => {
    const res = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('APPROVAL_REQUIRED');
    expect(JSON.stringify(res.body)).not.toContain('p4-plain-secret');
  });

  it('policy DENY blocks non-owner reveal', async () => {
    await request(app)
      .patch(`/api/policies/${PolicyResourceType.SECRET}/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ nonOwnerBehavior: NonOwnerBehavior.DENY });

    const denied = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    await request(app)
      .patch(`/api/policies/${PolicyResourceType.SECRET}/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ nonOwnerBehavior: NonOwnerBehavior.APPROVAL_REQUIRED });
  });

  it('user-specific ALLOW permits direct reveal', async () => {
    await request(app)
      .patch(`/api/policies/${PolicyResourceType.SECRET}/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        userAccess: [{ userId: engineerUserId, behavior: NonOwnerBehavior.ALLOW }],
      });

    const res = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(res.status).toBe(200);

    await request(app)
      .patch(`/api/policies/${PolicyResourceType.SECRET}/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ userAccess: [] });
  });

  it('access request flow: portal approve grants access without OTP', async () => {
    const createReq = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [secretId],
        permissions: ['secret.reveal'],
        reason: 'Production deployment',
      });
    expect(createReq.status).toBe(201);
    const requestId = createReq.body.request.id;
    expect(JSON.stringify(createReq.body)).not.toContain('p4-plain-secret');

    const selfApprove = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(selfApprove.status).toBe(403);

    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approve.status).toBe(200);
    expect(approve.body.request.status).toBe('APPROVED');
    expect(approve.body.grant.status).toBe('ACTIVE');

    const notifications = (
      await request(app)
        .get('/api/test/notifications')
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
    ).body.notifications as Array<{ event: string; otpCode?: string }>;
    expect(notifications.some((n) => n.event === 'ACCESS_REQUESTED')).toBe(true);
    expect(notifications.some((n) => n.event === 'ACCESS_APPROVED')).toBe(true);
    expect(notifications.every((n) => !n.otpCode)).toBe(true);

    const reveal = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(reveal.status).toBe(200);
    expect(reveal.body.value.password).toBe('p4-plain-secret');
  });

  it('rejects cross-tenant access request scope', async () => {
    const res = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [secretBId],
        permissions: ['secret.reveal'],
        reason: 'Cross tenant attempt',
      });
    expect([400, 404]).toContain(res.status);
  });

  it('duplicate pending request is rejected', async () => {
    const dupSecret = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'DUP_SCOPE_SECRET',
          type: VaultItemType.TEXT,
          value: { value: 'dup' },
        })
    ).body.secret.id;
    const body = {
      applicationId,
      environmentId,
      resourceType: 'SECRET' as const,
      resourceIds: [dupSecret],
      permissions: ['secret.reveal'],
      reason: 'Dup test 1',
    };
    const first = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send(body);
    expect(first.status).toBe(201);
    const dup = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({ ...body, reason: 'Dup test 2' });
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('rejected request cannot be approved again', async () => {
    const rejectSecret = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'REJECT_FLOW_SECRET',
          type: VaultItemType.TEXT,
          value: { value: 'reject-flow' },
        })
    ).body.secret.id;
    const createReq = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [rejectSecret],
        permissions: ['secret.reveal'],
        reason: 'Will reject',
      });
    expect(createReq.status).toBe(201);
    const requestId = createReq.body.request.id;
    await request(app)
      .post(`/api/access-requests/${requestId}/reject`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    const approveAgain = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approveAgain.status).toBe(400);
  });

  it('business admin non-owner still needs approval when policy requires it', async () => {
    const secretOwnedByEngineer = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'ENGINEER_SECRET',
          type: VaultItemType.TEXT,
          ownerId: engineerUserId,
          value: { value: 'engineer-owned' },
        })
    ).body.secret.id;

    const reveal = await request(app)
      .post(`/api/vault/secrets/${secretOwnedByEngineer}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(reveal.status).toBe(403);
    expect(reveal.body.error.code).toBe('APPROVAL_REQUIRED');
  });

  it('application manager can approve without being resource owner', async () => {
    const managerRole = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'AccessManagerP4',
        permissionKeys: ['access.approve', 'access.reject', 'access.view'],
      });
    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'p4-manager@test.local',
        password,
        displayName: 'Manager',
        roleIds: [managerRole.body.role.id],
      });
    const users = new UserRepository();
    const manager = await users.findByEmail('p4-manager@test.local');
    expect(manager).toBeTruthy();
    await request(app)
      .post(`/api/applications/${applicationId}/managers`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ userId: manager!._id.toString() });

    const cookieManager =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p4-manager@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const mgrSecret = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'MANAGER_APPROVE_SECRET',
          type: VaultItemType.TEXT,
          value: { value: 'mgr-flow' },
        })
    ).body.secret.id;

    const createReq = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [mgrSecret],
        permissions: ['secret.reveal'],
        reason: 'Manager approval path',
      });
    const requestId = createReq.body.request.id;

    const ownerApproveDenied = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(ownerApproveDenied.status).toBe(403);

    const managerApprove = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieManager);
    expect(managerApprove.status).toBe(200);
    expect(managerApprove.body.grant.status).toBe('ACTIVE');
  });

  it('OTP verification route is removed', async () => {
    const res = await request(app)
      .post('/api/access-requests/507f1f77bcf86cd799439011/verify-otp')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({ code: '123456' });
    expect(res.status).toBe(404);
  });

  it('allows access request for multiple resources with the same owner', async () => {
    const secretA = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'MULTI_OWNER_A',
          type: VaultItemType.TEXT,
          value: { value: 'a' },
        })
    ).body.secret.id;
    const secretB = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'MULTI_OWNER_B',
          type: VaultItemType.TEXT,
          value: { value: 'b' },
        })
    ).body.secret.id;

    const res = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [secretA, secretB],
        permissions: ['secret.reveal'],
        reason: 'Same owner bundle',
      });
    expect(res.status).toBe(201);
    expect(res.body.request.resourceIds).toHaveLength(2);
  });

  it('rejects mixed-owner resource bundle without creating a request', async () => {
    NotificationService.clearTestNotifications();
    const engineerSecret = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'MIXED_OWNER_ENGINEER',
          type: VaultItemType.TEXT,
          ownerId: engineerUserId,
          value: { value: 'eng' },
        })
    ).body.secret.id;
    const ownerSecret = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'MIXED_OWNER_ADMIN',
          type: VaultItemType.TEXT,
          value: { value: 'own' },
        })
    ).body.secret.id;

    const res = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [engineerSecret, ownerSecret],
        permissions: ['secret.reveal'],
        reason: 'Mixed owners',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MIXED_RESOURCE_OWNERS');

    const drained = NotificationService.drainTestNotifications();
    expect(drained).toHaveLength(0);
  });

  it('denies approve/reject for user with access.approve but not owner or manager', async () => {
    const approverRole = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'ApproverOnlyP4',
        permissionKeys: ['access.approve', 'access.reject', 'access.view'],
      });
    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'p4-approver-only@test.local',
        password,
        displayName: 'ApproverOnly',
        roleIds: [approverRole.body.role.id],
      });
    const cookieApproverOnly =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p4-approver-only@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const targetSecret = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'APPROVER_ONLY_TARGET',
          type: VaultItemType.TEXT,
          value: { value: 'target' },
        })
    ).body.secret.id;

    const createReq = await request(app)
      .post('/api/access-requests')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({
        applicationId,
        environmentId,
        resourceType: 'SECRET',
        resourceIds: [targetSecret],
        permissions: ['secret.reveal'],
        reason: 'Approver-only denial test',
      });
    expect(createReq.status).toBe(201);
    const requestId = createReq.body.request.id;

    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieApproverOnly);
    expect(approve.status).toBe(403);

    const reject = await request(app)
      .post(`/api/access-requests/${requestId}/reject`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieApproverOnly);
    expect(reject.status).toBe(403);
  });

  it('access responses never include secret plaintext', async () => {
    const list = await request(app)
      .get('/api/access-requests/mine')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('p4-plain-secret');
    expect(JSON.stringify(list.body)).not.toContain('engineer-owned');
  });
});
