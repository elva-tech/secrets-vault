import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { NonOwnerBehavior, PolicyResourceType, TenantStatus, VaultItemType } from '@vault/shared';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { UserRepository } from '../modules/users/repositories/user.repository.js';
import mongoose from 'mongoose';
import { OtpModel } from '../modules/access-control/models/otp.model.js';
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

  it('access request flow: approve, OTP verify, scoped grant reveal', async () => {
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

    const notifications = (
      await request(app)
        .get('/api/test/notifications')
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
    ).body.notifications as Array<{ otpCode?: string }>;
    const otp = notifications.find((n) => n.otpCode)?.otpCode;
    expect(otp).toMatch(/^\d{6}$/);

    const stored = await OtpModel.findOne({
      accessRequestId: new mongoose.Types.ObjectId(requestId),
    })
      .select('+hashedCode')
      .exec();
    expect(stored?.hashedCode).toBeTruthy();
    expect(stored?.hashedCode).not.toBe(otp);

    const badOtp = await request(app)
      .post(`/api/access-requests/${requestId}/verify-otp`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({ code: '000000' });
    expect(badOtp.status).toBe(400);

    const verify = await request(app)
      .post(`/api/access-requests/${requestId}/verify-otp`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({ code: otp });
    expect(verify.status).toBe(200);
    expect(verify.body.grant.status).toBe('ACTIVE');

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

  it('rejected request cannot verify OTP', async () => {
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
    const verify = await request(app)
      .post(`/api/access-requests/${requestId}/verify-otp`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieEngineer)
      .send({ code: '123456' });
    expect(verify.status).toBe(400);
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
