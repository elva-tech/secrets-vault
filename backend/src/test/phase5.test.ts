import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { RotationType, TenantStatus, VaultItemType } from '@vault/shared';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { SecretVersionModel } from '../modules/vault/models/secret-version.model.js';
import { JobQueueService } from '../modules/jobs/services/job-queue.service.js';
import { RotationService } from '../modules/vault/services/rotation.service.js';
import mongoose from 'mongoose';
import { AccessGrantModel } from '../modules/access-control/models/access-grant.model.js';
import { AccessGrantStatus } from '@vault/shared';

const BASE = 'vault.elvatech.in';
const hostA = `elva.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

describe('Phase 5 — personal vault, rotation, audit', () => {
  let app: Application;
  let cookieOwner: string;
  let cookiePeer: string;
  let applicationId: string;
  let environmentId: string;
  let appSecretId: string;
  let personalSecretId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const tenantAdmin = new TenantAdminService();
    const tenantA = await tenantAdmin.createTenant({
      name: 'ELVA',
      slug: 'elva',
      businessAdmin: { email: 'p5-owner@test.local', password, displayName: 'Owner' },
    });
    await tenantAdmin.setTenantStatus(tenantA.id, TenantStatus.ACTIVE);

    cookieOwner =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p5-owner@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const peerRole = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'PeerPersonal',
        permissionKeys: [
          'personal.secret.view',
          'personal.secret.create',
          'personal.secret.reveal',
          'secret.view',
          'audit.view',
        ],
      });
    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'p5-peer@test.local',
        password,
        displayName: 'Peer',
        roleIds: [peerRole.body.role.id],
      });
    cookiePeer =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p5-peer@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const appRes = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ name: 'Shop', slug: 'shop-p5' });
    applicationId = appRes.body.application.id;
    environmentId = (
      await request(app)
        .get(`/api/applications/${applicationId}/environments`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
    ).body.environments[0].id;

    appSecretId = (
      await request(app)
        .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'APP_SECRET',
          type: VaultItemType.TEXT,
          value: { value: 'app-only' },
        })
    ).body.secret.id;

    personalSecretId = (
      await request(app)
        .post('/api/personal-vault/secrets')
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieOwner)
        .send({
          name: 'MY_PRIVATE',
          type: VaultItemType.PASSWORD,
          value: { password: 'personal-only-value' },
        })
    ).body.secret.id;
  });

  it('owner can reveal personal secret', async () => {
    const res = await request(app)
      .post(`/api/personal-vault/secrets/${personalSecretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(res.status).toBe(200);
    expect(res.body.value.password).toBe('personal-only-value');
  });

  it('peer in same tenant cannot access personal secret', async () => {
    const res = await request(app)
      .post(`/api/personal-vault/secrets/${personalSecretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookiePeer);
    expect(res.status).toBe(404);
  });

  it('business admin list application vault excludes personal secrets', async () => {
    const list = await request(app)
      .get(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(list.status).toBe(200);
    const ids = list.body.secrets.map((s: { id: string }) => s.id);
    expect(ids).toContain(appSecretId);
    expect(ids).not.toContain(personalSecretId);
    expect(JSON.stringify(list.body)).not.toContain('personal-only-value');
  });

  it('reveal creates audit without secret value', async () => {
    await request(app)
      .post(`/api/vault/secrets/${appSecretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    const logs = await request(app)
      .get('/api/audit/logs?action=SECRET_REVEALED')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(logs.status).toBe(200);
    expect(logs.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs.body)).not.toContain('app-only');
  });

  it('rejects past custom rotation date', async () => {
    const res = await request(app)
      .patch(`/api/vault/secrets/${appSecretId}/rotation`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        rotationType: RotationType.CUSTOM_DATE,
        customRotationDate: new Date(Date.now() - 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('manual rotation creates new encrypted version', async () => {
    const before = await SecretVersionModel.countDocuments({
      secretId: new mongoose.Types.ObjectId(appSecretId),
    });
    const rotate = await request(app)
      .post(`/api/vault/secrets/${appSecretId}/rotate`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({ value: { value: 'rotated-value' } });
    expect(rotate.status).toBe(200);
    const after = await SecretVersionModel.countDocuments({
      secretId: new mongoose.Types.ObjectId(appSecretId),
    });
    expect(after).toBe(before + 1);
    const reveal = await request(app)
      .post(`/api/vault/secrets/${appSecretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner);
    expect(reveal.body.value.value).toBe('rotated-value');
  });

  it('rotation reminder job dedup is idempotent', async () => {
    const queue = new JobQueueService();
    const rotation = new RotationService();
    const date = new Date('2030-12-24T00:00:00.000Z');
    const key = rotation.reminderDedupKey(appSecretId, date, 10);
    const first = await queue.enqueue('ROTATION_REMINDER', key, { secretName: 'APP_SECRET' }, new Date());
    const second = await queue.enqueue('ROTATION_REMINDER', key, { secretName: 'APP_SECRET' }, new Date());
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('expired grant denies reveal for non-owner', async () => {
    const role = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'RevealOnlyP5',
        permissionKeys: ['secret.view', 'secret.reveal'],
      });
    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'p5-grant@test.local',
        password,
        displayName: 'GrantUser',
        roleIds: [role.body.role.id],
      });
    const grantUserCookie =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p5-grant@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const grantUser = (
      await request(app)
        .get('/api/auth/me')
        .set('X-Vault-Host', hostA)
        .set('Cookie', grantUserCookie)
    ).body.user.id;

    const me = await request(app).get('/api/auth/me').set('X-Vault-Host', hostA).set('Cookie', cookieOwner);
    const tenantId = me.body.tenant?.id ?? me.body.tenantId;
    await AccessGrantModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      accessRequestId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(grantUser),
      applicationId: new mongoose.Types.ObjectId(applicationId),
      environmentId: new mongoose.Types.ObjectId(environmentId),
      resourceIds: [new mongoose.Types.ObjectId(appSecretId)],
      resourceType: 'SECRET',
      permissions: ['secret.reveal'],
      grantedBy: new mongoose.Types.ObjectId(grantUser),
      grantedAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() - 1000),
      status: AccessGrantStatus.EXPIRED,
    });

    const denied = await request(app)
      .post(`/api/vault/secrets/${appSecretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', grantUserCookie);
    expect(denied.status).toBe(403);
  });

  it('audit API has no mutation routes', async () => {
    const patch = await request(app)
      .patch('/api/audit/logs/000000000000000000000001')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({});
    expect(patch.status).toBe(404);
  });
});
