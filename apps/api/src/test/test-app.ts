import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { createApp } from '../app.js';
import { runBootstrap } from '../bootstrap/seed.js';
import type { Application } from 'express';

export async function createTestApp(): Promise<Application> {
  await connectDatabase();
  await runBootstrap();
  return createApp();
}

export async function teardownTestApp(): Promise<void> {
  await disconnectDatabase();
}
