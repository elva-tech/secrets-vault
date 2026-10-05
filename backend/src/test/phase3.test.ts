import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { TenantStatus, VaultItemType } from '@vault/shared';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import mongoose from 'mongoose';
import { SecretVersionModel } from '../modules/vault/models/secret-version.model.js';

const BASE = 'vault.elvatech.in';
const hostA = `elva.${BASE}`;
const hostB = `abc.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

describe('Phase 3 — vault secrets and files', () => {
  let app: Application;
  let cookieA: string;
  let cookieB: string;
  let applicationId: string;
  let environmentId: string;
  let secretId: string;
  let secretBId: string;
  let fileId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const tenantAdmin = new TenantAdminService();

    const tenantA = await tenantAdmin.createTenant({
      name: 'ELVA',
      slug: 'elva',
      businessAdmin: { email: 'p3-a@test.local', password, displayName: 'A' },
    });
    await tenantAdmin.setTenantStatus(tenantA.id, TenantStatus.ACTIVE);

    const tenantB = await tenantAdmin.createTenant({
      name: 'ABC',
      slug: 'abc',
      businessAdmin: { email: 'p3-b@test.local', password, displayName: 'B' },
    });
    await tenantAdmin.setTenantStatus(tenantB.id, TenantStatus.ACTIVE);

    cookieA =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p3-a@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    cookieB =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostB)
          .send({ email: 'p3-b@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const appRes = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({ name: 'ApnaCart', slug: 'apnacart' });
    applicationId = appRes.body.application.id;
    environmentId = (
      await request(app)
        .get(`/api/applications/${applicationId}/environments`)
        .set('X-Vault-Host', hostA)
        .set('Cookie', cookieA)
    ).body.environments.find((e: { slug: string }) => e.slug === 'prod').id;

    const createSecret = await request(app)
      .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({
        name: 'DATABASE_PASSWORD',
        type: VaultItemType.PASSWORD,
        value: { username: 'admin', password: 'p3-secret-value' },
      });
    secretId = createSecret.body.secret.id;

    const appB = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostB)
      .set('Cookie', cookieB)
      .send({ name: 'Other', slug: 'other' });
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
          value: { value: 'tenant-b-token' },
        })
    ).body.secret.id;
  });

  it('list never returns plaintext', async () => {
    const list = await request(app)
      .get(`/api/vault/applications/${applicationId}/environments/${environmentId}/secrets`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA);
    expect(list.status).toBe(200);
    const body = JSON.stringify(list.body);
    expect(body).not.toContain('p3-secret-value');
    expect(list.body.secrets[0].masked).toBe(true);
  });

  it('detail metadata excludes plaintext', async () => {
    const detail = await request(app)
      .get(`/api/vault/secrets/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain('p3-secret-value');
  });

  it('reveal returns value only via dedicated endpoint', async () => {
    const reveal = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA);
    expect(reveal.status).toBe(200);
    expect(reveal.body.value.password).toBe('p3-secret-value');
  });

  it('update creates new encrypted version', async () => {
    const patch = await request(app)
      .patch(`/api/vault/secrets/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({
        value: { username: 'admin', password: 'p3-secret-value-v2' },
        reason: 'rotation prep',
      });
    expect(patch.status).toBe(200);
    expect(patch.body.secret.currentVersionNumber).toBe(2);
    const versions = await SecretVersionModel.find({
      secretId: new mongoose.Types.ObjectId(secretId),
    }).sort({ versionNumber: 1 });
    expect(versions).toHaveLength(2);
    expect(versions[0].envelope.ciphertext).not.toContain('p3-secret-value-v2');
  });

  it('tenant B cannot read tenant A secret', async () => {
    const res = await request(app)
      .get(`/api/vault/secrets/${secretId}`)
      .set('X-Vault-Host', hostB)
      .set('Cookie', cookieB);
    expect(res.status).toBe(404);
  });

  it('rejects tenantId query override', async () => {
    const res = await request(app)
      .get(`/api/vault/secrets/${secretId}`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .query({ tenantId: 'evil' });
    expect(res.status).toBe(400);
  });

  it('uploads and downloads encrypted file', async () => {
    const upload = await request(app)
      .post(`/api/vault/applications/${applicationId}/environments/${environmentId}/files`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('secret-file-content'), {
        filename: 'config.json',
        contentType: 'application/json',
      })
      .field('name', 'config.json');
    expect(upload.status).toBe(201);
    fileId = upload.body.file.id;

    const cross = await request(app)
      .get(`/api/vault/files/${fileId}/download`)
      .set('X-Vault-Host', hostB)
      .set('Cookie', cookieB);
    expect(cross.status).toBe(404);

    const download = await request(app)
      .get(`/api/vault/files/${fileId}/download`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect((download.body as Buffer).toString()).toBe('secret-file-content');
  });

  it('RBAC denies reveal without permission', async () => {
    const role = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({
        name: 'SecretViewerNoReveal',
        permissionKeys: ['secret.view'],
      });
    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({
        email: 'p3-limited@test.local',
        password,
        displayName: 'Limited',
        roleIds: [role.body.role.id],
      });
    const limitedCookie =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'p3-limited@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const denied = await request(app)
      .post(`/api/vault/secrets/${secretId}/reveal`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', limitedCookie);
    expect(denied.status).toBe(403);
  });
});
