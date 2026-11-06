import { defineWorkspace } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(__dirname, 'src') };

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'unit',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.int.test.ts'],
      setupFiles: ['src/test/no-network.ts'],
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'integration',
      environment: 'node',
      include: ['src/**/*.int.test.ts'],
      setupFiles: ['src/test/no-network.ts', 'src/test/int-setup.ts'],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 20000,
      hookTimeout: 30000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://hotel:hotel@127.0.0.1:5435/hotel_test',
        ALLOW_TEST_RESET: '1',
        DB_INIT_DIR: path.resolve(__dirname, '../db/init'),
      },
    },
  },
]);
