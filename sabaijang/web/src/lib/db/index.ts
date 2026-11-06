import pg from 'pg';

// NUMERIC → number (money is NUMERIC(12,2); values stay well inside double precision)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE → 'YYYY-MM-DD' string (no timezone shifting)
pg.types.setTypeParser(1082, (v) => v);
// INT8 → number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const g = globalThis as unknown as { __hotelPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__hotelPool) {
    g.__hotelPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgres://hotel:hotel@127.0.0.1:5434/hotel',
      max: 10,
    });
  }
  return g.__hotelPool;
}

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = pool(),
) {
  return db.query<T>(text, params);
}

/** Run fn inside a transaction; rolls back on any throw. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export async function closePool() {
  if (g.__hotelPool) {
    await g.__hotelPool.end();
    g.__hotelPool = undefined;
  }
}
