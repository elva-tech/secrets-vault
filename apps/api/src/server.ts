import { loadAppDotenv } from './config/load-dotenv.js';
import { loadEnv } from './config/env.js';

loadAppDotenv();
import { connectDatabase } from './database/connection.js';
import { createApp } from './app.js';
import { logger } from './config/logger.js';
import { runBootstrap } from './bootstrap/seed.js';
import { startBackgroundWorker, stopBackgroundWorker } from './modules/jobs/services/job-worker.service.js';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDatabase();
  await runBootstrap();
  const app = createApp();
  if (env.NODE_ENV !== 'test') {
    startBackgroundWorker();
  }
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT}`);
  });
  const shutdown = () => {
    stopBackgroundWorker();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start server', { message: String(err) });
  process.exit(1);
});
