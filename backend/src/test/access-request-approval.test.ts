import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';
import { AccessGrantStatus, TenantStatus, VaultItemType } from '@vault/shared';
import { createTestApp } from './test-app.js';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { NotificationService } from '../modules/notifications/notification.service.js';
import { AccessRequestModel } from '../modules/access-control/models/access-request.model.js';
import { AccessGrantModel } from '../modules/access-control/models/access-grant.model.js';
import { AccessGrantRepository } from '../modules/access-control/repositories/access-grant.repository.js';
import { AccessRequestStatus } from '@vault/shared';

const BASE = 'vault.elvatech.in';
const hostA = `elva-apr.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

describe('Access request approval compensation', () => {
  let app: Application;
  let cookieOwner: string;
  let cookieEngineer: string;
  let applicationId: string;
  let environmentId: string;
  beforeAll(async () => {
    app = await createTestApp();
    NotificationService.clearTestNotifications();
    const tenantAdmin = new TenantAdminService();
    const tenant = await tenantAdmin.createTenant({
      name: 'ELVA Apr',
      slug: 'elva-apr',
      businessAdmin: { email: 'apr-owner@test.local', password, displayName: 'Owner' },
    });
    await tenantAdmin.setTenantStatus(tenant.id, TenantStatus.ACTIVE);

    cookieOwner =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'apr-owner@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const roleRes = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'AprEngineer',
        permissionKeys: ['secret.view', 'secret.reveal', 'access.request', 'access.view'],
      });

    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'apr-engineer@test.local',
        password,
        displayName: 'Engineer',
        roleIds: [roleRes.body.role.id],
      });

    cookieEngineer =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'apr-engineer@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const appRes = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ name: 'AprApp', slug: 'apr-app' });
    applicationId = appRes.body.application.id;
    environmentId = (
      await request(app)
        .get(`/api/applications/${applicationId}/environments`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
    ).body.environments.find((e: { slug: string }) => e.slug === 'prod').id;

  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createPendingRequest(): Promise<string> {
    const resourceId = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: `APR_REQ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: VaultItemType.TEXT,
          value: { value: 'apr-req' },
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
        resourceIds: [resourceId],
        permissions: ['secret.reveal'],
        reason: 'Approval compensation test',
      });
    expect(res.status).toBe(201);
    return res.body.request.id;
  }

  it('grant creation failure leaves no active grant and request not approved', async () => {
    const requestId = await createPendingRequest();
    vi.spyOn(AccessGrantRepository.prototype, 'create').mockRejectedValueOnce(new Error('simulated create failure'));

    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approve.status).toBe(500);

    const row = await AccessRequestModel.findById(requestId).exec();
    expect(row?.status).toBe(AccessRequestStatus.PENDING);

    const activeGrants = await AccessGrantModel.countDocuments({
      accessRequestId: new mongoose.Types.ObjectId(requestId),
      status: AccessGrantStatus.ACTIVE,
    });
    expect(activeGrants).toBe(0);
  });

  it('grant link failure revokes grant and returns request to pending', async () => {
    const requestId = await createPendingRequest();
    const updateSpy = vi.spyOn(AccessRequestModel, 'updateOne');
    updateSpy.mockImplementationOnce(
      () =>
        ({
          exec: async () => ({ modifiedCount: 0, acknowledged: true }),
        }) as ReturnType<typeof AccessRequestModel.updateOne>,
    );

    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approve.status).toBe(400);
    expect(approve.body.error.code).toBe('GRANT_LINK_FAILED');

    const row = await AccessRequestModel.findById(requestId).exec();
    expect(row?.status).toBe(AccessRequestStatus.PENDING);
    expect(row?.grantId).toBeNull();

    const activeGrants = await AccessGrantModel.countDocuments({
      accessRequestId: new mongoose.Types.ObjectId(requestId),
      status: AccessGrantStatus.ACTIVE,
    });
    expect(activeGrants).toBe(0);
  });

  it('failed grant revoke surfaces APPROVAL_ROLLBACK_INCOMPLETE', async () => {
    const requestId = await createPendingRequest();
    const updateSpy = vi.spyOn(AccessRequestModel, 'updateOne');
    updateSpy.mockImplementationOnce(
      () =>
        ({
          exec: async () => ({ modifiedCount: 0, acknowledged: true }),
        }) as ReturnType<typeof AccessRequestModel.updateOne>,
    );
    vi.spyOn(AccessGrantRepository.prototype, 'revoke').mockResolvedValueOnce(null);

    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approve.status).toBe(400);
    expect(approve.body.error.code).toBe('APPROVAL_ROLLBACK_INCOMPLETE');
  });

  it('rollback does not overwrite REJECTED request state', async () => {
    const requestId = await createPendingRequest();
    await AccessRequestModel.updateOne(
      { _id: requestId },
      { status: AccessRequestStatus.REJECTED, rejectedAt: new Date() },
    );

    const reverted = await AccessRequestModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(requestId),
        status: AccessRequestStatus.APPROVED,
        grantId: null,
      },
      {
        status: AccessRequestStatus.PENDING,
        approvedAt: null,
        approvedBy: null,
      },
      { new: true },
    ).exec();
    expect(reverted).toBeNull();

    const row = await AccessRequestModel.findById(requestId).exec();
    expect(row?.status).toBe(AccessRequestStatus.REJECTED);
  });

  it('successful approval creates exactly one active grant', async () => {
    const requestId = await createPendingRequest();
    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approve.status).toBe(200);

    const activeGrants = await AccessGrantModel.countDocuments({
      accessRequestId: new mongoose.Types.ObjectId(requestId),
      status: AccessGrantStatus.ACTIVE,
    });
    expect(activeGrants).toBe(1);
  });

  it('notification failure after approval does not revoke grant', async () => {
    const requestId = await createPendingRequest();
    vi.spyOn(NotificationService.prototype, 'send').mockImplementation(async (payload) => {
      if (payload.event === 'ACCESS_APPROVED') {
        throw new Error('simulated notify failure');
      }
    });

    const approve = await request(app)
      .post(`/api/access-requests/${requestId}/approve`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(approve.status).toBe(500);

    const row = await AccessRequestModel.findById(requestId).exec();
    expect(row?.status).toBe(AccessRequestStatus.APPROVED);
    expect(row?.grantId).toBeTruthy();

    const activeGrants = await AccessGrantModel.countDocuments({
      accessRequestId: new mongoose.Types.ObjectId(requestId),
      status: AccessGrantStatus.ACTIVE,
    });
    expect(activeGrants).toBe(1);
  });
});
