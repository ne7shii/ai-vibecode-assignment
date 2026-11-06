import { ensureDatabase } from './lib/db/reset';

/** Build schema + seed on an empty database before serving, retrying while Postgres starts. */
export async function initDatabaseOnStartup() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await ensureDatabase();
      console.log('[startup] database ready');
      return;
    } catch (e) {
      console.error(`[startup] database not ready (attempt ${attempt}/10):`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
