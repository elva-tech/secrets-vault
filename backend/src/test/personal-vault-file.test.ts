import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { TenantStatus } from '@vault/shared';
import { createTestApp } from './test-app.js';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';

const BASE = 'vault.elvatech.in';
const hostA = `elva-pv.${BASE}`;
const hostB = `abc-pv.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

/** Minimal bytes for a synthetic .docx (zip-based); content is not a valid Word doc but exercises upload policy. */
const SYNTHETIC_DOCX = Buffer.from('PK\x03\x04synthetic-docx-fixture');

describe('Personal vault file upload and download', () => {
  let app: Application;
  let cookieOwner: string;
  let cookiePeer: string;
  let cookieOtherTenant: string;

  beforeAll(async () => {
    app = await createTestApp();
    const tenantAdmin = new TenantAdminService();
    const tenantA = await tenantAdmin.createTenant({
      name: 'PV A',
      slug: 'elva-pv',
      businessAdmin: { email: 'pv-a@test.local', password, displayName: 'A' },
    });
    await tenantAdmin.setTenantStatus(tenantA.id, TenantStatus.ACTIVE);
    const tenantB = await tenantAdmin.createTenant({
      name: 'PV B',
      slug: 'abc-pv',
      businessAdmin: { email: 'pv-b@test.local', password, displayName: 'B' },
    });
    await tenantAdmin.setTenantStatus(tenantB.id, TenantStatus.ACTIVE);

    cookieOwner =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'pv-a@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const peerRole = await request(app)
      .post('/api/tenant/roles')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        name: 'PeerNoPersonalFiles',
        permissionKeys: ['personal.secret.view'],
      });
    await request(app)
      .post('/api/tenant/users')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .send({
        email: 'pv-peer@test.local',
        password,
        displayName: 'Peer',
        roleIds: [peerRole.body.role.id],
      });
    cookiePeer =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'pv-peer@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    cookieOtherTenant =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostB)
          .send({ email: 'pv-b@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  it('uploads docx and downloads identical bytes for owner', async () => {
    const upload = await request(app)
      .post('/api/personal-vault/files')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .attach('file', SYNTHETIC_DOCX, {
        filename: 'notes.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .field('name', 'notes.docx');
    expect(upload.status).toBe(201);
    expect(upload.body.file.name).toBe('notes.docx');

    const download = await request(app)
      .get(`/api/personal-vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body as Buffer, SYNTHETIC_DOCX)).toBe(0);
  });

  it('rejects disallowed extension on personal vault', async () => {
    const res = await request(app)
      .post('/api/personal-vault/files')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .attach('file', Buffer.from('x'), { filename: 'bad.exe', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('peer cannot download owner personal file', async () => {
    const upload = await request(app)
      .post('/api/personal-vault/files')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .attach('file', Buffer.from('private'), { filename: 'private.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(201);

    const denied = await request(app)
      .get(`/api/personal-vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookiePeer);
    expect([403, 404]).toContain(denied.status);
  });

  it('other tenant cannot download file', async () => {
    const upload = await request(app)
      .post('/api/personal-vault/files')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieOwner)
      .attach('file', Buffer.from('tenant-a'), { filename: 'iso.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(201);

    const cross = await request(app)
      .get(`/api/personal-vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostB)
      .set('Cookie', cookieOtherTenant);
    expect(cross.status).toBe(404);
  });
});
