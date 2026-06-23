import pg from 'pg';

/**
 * Shared PostgreSQL connection pool.
 *
 * Connection is configured via DATABASE_URL, e.g.
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname
 * In docker-compose the host is the postgres service name (e.g. "db").
 *
 * Set PGSSL=true to enable TLS (for managed Postgres that requires it).
 */

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Point it at your Postgres instance, e.g. ' +
    'postgres://user:pass@db:5432/cloudfuze'
  );
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.message);
});

/** Run a parameterized query. Returns the pg result ({ rows, rowCount }). */
export function query(text, params) {
  return pool.query(text, params);
}

/** Convenience: run a query and return its rows. */
export async function rows(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

/** Convenience: run a query and return the first row (or null). */
export async function one(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

/**
 * Run fn inside a transaction. fn receives a dedicated client whose .query()
 * runs on that connection. Commits on success, rolls back on throw.
 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Wait for the database to accept connections (used at startup). */
export async function waitForDb({ retries = 30, delayMs = 1000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[pg] waiting for database (${attempt}/${retries})...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
