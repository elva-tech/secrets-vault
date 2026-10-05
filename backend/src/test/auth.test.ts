import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app.js';
import type { Application } from 'express';
import { PasswordService } from '../modules/auth/services/password.service.js';
import { UserRepository } from '../modules/users/repositories/user.repository.js';

const BASE = 'vault.elvatech.in';

describe('Authentication', () => {
  let app: Application;
  const password = 'Str0ngP@ssw0rd!';

  beforeAll(async () => {
    app = await createTestApp();
    const passwords = new PasswordService();
    const users = new UserRepository();
    await users.create({
      email: 'auth-super@test.local',
      passwordHash: await passwords.hash(password),
      displayName: 'Auth Super',
      isPlatformSuperAdmin: true,
    });
  });

  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/platform/login')
      .set('X-Vault-Host', BASE)
      .send({ email: 'auth-super@test.local', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
  });

  it('login, me, and logout flow', async () => {
    const login = await request(app)
      .post('/api/auth/platform/login')
      .set('X-Vault-Host', BASE)
      .send({ email: 'auth-super@test.local', password });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    const me = await request(app)
      .get('/api/auth/me')
      .set('X-Vault-Host', BASE)
      .set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.isPlatformSuperAdmin).toBe(true);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);

    const meAfter = await request(app)
      .get('/api/auth/me')
      .set('X-Vault-Host', BASE)
      .set('Cookie', cookie);
    expect(meAfter.status).toBe(401);
  });
});
