import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { TenantStatus } from '@vault/shared';
import { createTestApp } from './test-app.js';
import { TenantAdminService } from '../modules/platform/services/tenant-admin.service.js';
import { getObjectStorageProvider } from '../modules/vault/files/object-storage.factory.js';
import mongoose from 'mongoose';

const BASE = 'vault.elvatech.in';
const hostA = `elva-vf.${BASE}`;
const hostB = `abc-vf.${BASE}`;
const password = 'Str0ngP@ssw0rd!';

describe('Vault file upload and download', () => {
  let app: Application;
  let cookieA: string;
  let cookieB: string;
  let applicationId: string;
  let environmentId: string;
  beforeAll(async () => {
    app = await createTestApp();
    const tenantAdmin = new TenantAdminService();
    const tenantA = await tenantAdmin.createTenant({
      name: 'VF A',
      slug: 'elva-vf',
      businessAdmin: { email: 'vf-a@test.local', password, displayName: 'A' },
    });
    await tenantAdmin.setTenantStatus(tenantA.id, TenantStatus.ACTIVE);
    const tenantB = await tenantAdmin.createTenant({
      name: 'VF B',
      slug: 'abc-vf',
      businessAdmin: { email: 'vf-b@test.local', password, displayName: 'B' },
    });
    await tenantAdmin.setTenantStatus(tenantB.id, TenantStatus.ACTIVE);

    cookieA =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostA)
          .send({ email: 'vf-a@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    cookieB =
      (
        await request(app)
          .post('/api/auth/tenant/login')
          .set('X-Vault-Host', hostB)
          .send({ email: 'vf-b@test.local', password })
      ).headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const appRes = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({ name: 'VF App', slug: 'vf-app' });
    applicationId = appRes.body.application.id;

    const envs = await request(app)
      .get(`/api/applications/${applicationId}/environments`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA);
    environmentId = envs.body.environments.find((e: { slug: string }) => e.slug === 'prod').id;
  });

  function uploadPath(envId: string) {
    return `/api/vault/applications/${applicationId}/environments/${envId}/files`;
  }

  it('uploads UTF-8 text and downloads identical bytes', async () => {
    const content = 'synthetic-utf8-test-αβ';
    const upload = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from(content, 'utf8'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .field('name', 'notes.txt');
    expect(upload.status).toBe(201);
    expect(upload.body.file.name).toBe('notes.txt');

    const storage = getObjectStorageProvider();
    const recordKey = upload.body.file.id;
    const fileRow = await mongoose.connection.db
      ?.collection('vaultfiles')
      .findOne({ _id: new mongoose.Types.ObjectId(recordKey) });
    expect(fileRow?.storageKey).toBeTruthy();
    const stored = await storage.getObject(fileRow!.storageKey as string);
    expect(stored.toString('utf8')).not.toBe(content);

    const download = await request(app)
      .get(`/api/vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect((download.body as Buffer).toString('utf8')).toBe(content);
  });

  it('uploads binary file byte-for-byte', async () => {
    const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x42]);
    const upload = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', bytes, { filename: 'blob.txt', contentType: 'application/octet-stream' });
    expect(upload.status).toBe(201);

    const download = await request(app)
      .get(`/api/vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(Buffer.compare(download.body as Buffer, bytes)).toBe(0);
  });

  it('uploads PDF with spaces in filename and downloads identical bytes', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const upload = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', pdf, {
        filename: 'Arun P N - Form 11.pdf',
        contentType: 'application/pdf',
      });
    expect(upload.status).toBe(201);
    expect(upload.body.file.originalFilename).toBe('Arun P N - Form 11.pdf');

    const download = await request(app)
      .get(`/api/vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(Buffer.compare(download.body as Buffer, pdf)).toBe(0);
  });

  it('allows dotenv-style .env.example uploads', async () => {
    const upload = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('KEY=value\n'), {
        filename: '.env.example',
        contentType: 'text/plain',
      });
    expect(upload.status).toBe(201);
    expect(upload.body.file.name).toBe('.env.example');
  });

  it('rejects missing multipart file', async () => {
    const res = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .field('name', 'empty');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('rejects disallowed extension', async () => {
    const res = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('x'), { filename: 'malware.exe', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('rejects environment that does not belong to application', async () => {
    const otherApp = await request(app)
      .post('/api/applications')
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .send({ name: 'Other', slug: 'vf-other' });
    const res = await request(app)
      .post(`/api/vault/applications/${otherApp.body.application.id}/environments/${environmentId}/files`)
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(404);
  });

  it('rejects cross-tenant download', async () => {
    const upload = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('tenant-a'), { filename: 'iso.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(201);

    const cross = await request(app)
      .get(`/api/vault/files/${upload.body.file.id}/download`)
      .set('X-Vault-Host', hostB)
      .set('Cookie', cookieB);
    expect(cross.status).toBe(404);
  });

  it('cleans up storage when metadata create fails', async () => {
    const { VaultFileRepository } = await import('../modules/vault/repositories/vault-file.repository.js');
    const storage = getObjectStorageProvider();
    const deleteSpy = vi.spyOn(storage, 'deleteObject');
    vi.spyOn(VaultFileRepository.prototype, 'create').mockRejectedValueOnce(
      new Error('simulated metadata failure'),
    );

    const upload = await request(app)
      .post(uploadPath(environmentId))
      .set('X-Vault-Host', hostA)
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('orphan-test'), { filename: 'orphan.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(500);
    expect(deleteSpy).toHaveBeenCalled();
  });
});
