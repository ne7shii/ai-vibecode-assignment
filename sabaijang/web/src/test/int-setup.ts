import { beforeAll, afterAll } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { closePool } from '@/lib/db';

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closePool();
});
