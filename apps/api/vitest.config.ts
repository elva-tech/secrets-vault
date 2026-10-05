import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 60000,
    setupFiles: ['./src/test/setup-env.ts', './src/test/setup.ts'],
  },
});
