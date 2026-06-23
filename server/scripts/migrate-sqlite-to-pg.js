/**
 * One-time migration: copy data from the legacy SQLite databases into Postgres.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db \
 *   node scripts/migrate-sqlite-to-pg.js [path-to-sqlite-dir]
 *
 * The SQLite directory must contain copilot.db and/or email.db. It defaults to
 * SQLITE_DIR, then DATA_DIR, then ./data. The migration is idempotent — it is
 * tracked by a schema_meta marker in Postgres and is a no-op on re-run.
 *
 * This reuses the exact schema + row-copy logic the app runs on first boot
 * (initCopilotDb / initEmailDb), so there is a single source of truth.
 */

// Resolve the source directory BEFORE importing anything that reads DATA_DIR,
// since paths.js captures DATA_DIR at module-load time.
const sourceDir = process.argv[2] || process.env.SQLITE_DIR || process.env.DATA_DIR;
if (sourceDir) process.env.DATA_DIR = sourceDir;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Point it at your Postgres instance and retry.');
  process.exit(1);
}

const run = async () => {
  const { existsSync } = await import('fs');
  const { DATA_DIR, dataPath } = await import('../config/paths.js');
  const { waitForDb, pool } = await import('../db/pool.js');
  const { initCopilotDb } = await import('../db/copilotDb.js');
  const { initEmailDb } = await import('../db/emailDb.js');

  console.log(`Source SQLite directory: ${DATA_DIR}`);
  const hasCopilot = existsSync(dataPath('copilot.db'));
  const hasEmail = existsSync(dataPath('email.db'));
  console.log(`  copilot.db: ${hasCopilot ? 'found' : 'MISSING'}`);
  console.log(`  email.db:   ${hasEmail ? 'found' : 'MISSING'}`);
  if (!hasCopilot && !hasEmail) {
    console.warn('No legacy .db files found — nothing to migrate (schema will still be created).');
  }

  console.log('Connecting to Postgres...');
  await waitForDb();

  console.log('Migrating copilot data...');
  await initCopilotDb();

  console.log('Migrating email data...');
  await initEmailDb();

  await pool.end();
  console.log('Migration complete.');
};

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
