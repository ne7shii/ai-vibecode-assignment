import pg from 'pg';

export async function checkDb(url = process.env.DATABASE_URL): Promise<boolean> {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    await c.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}
