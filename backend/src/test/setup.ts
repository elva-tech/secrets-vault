import { beforeAll, afterAll, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { resetEnvCache } from '../config/env.js';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4001';
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  process.env.VAULT_BASE_DOMAIN = 'vault.elvatech.in';
  process.env.SESSION_SECRET = 'test-session-secret-minimum-32-chars!!';
  process.env.SESSION_TTL_SECONDS = '3600';
  resetEnvCache();

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  resetEnvCache();
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongo) await mongo.stop();
});
