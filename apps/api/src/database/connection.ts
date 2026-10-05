import dns from 'node:dns';
import mongoose from 'mongoose';
import { loadEnv } from '../config/env.js';
import { logger } from '../config/logger.js';

function configureMongoDns(): void {
  const servers = process.env.MONGODB_DNS_SERVERS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers?.length) {
    dns.setServers(servers);
    logger.info('Using custom DNS for MongoDB', { servers });
    return;
  }
  // Windows often refuses SRV lookups on the default resolver (querySrv ECONNREFUSED).
  if (process.env.NODE_ENV === 'development') {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
  }
}

export async function connectDatabase(uri?: string): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  configureMongoDns();
  const { MONGODB_URI } = loadEnv();
  const connectionUri = uri ?? MONGODB_URI;
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(connectionUri);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('querySrv') || message.includes('ECONNREFUSED')) {
      throw new Error(
        `${message} — If using Atlas, check network/VPN/firewall, Atlas IP allowlist, and try MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8 or a non-SRV connection string from Atlas.`,
      );
    }
    throw err;
  }
  logger.info('MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
