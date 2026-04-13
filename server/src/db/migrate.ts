import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from '../config/env';

const MAX_RETRIES = 10;
const RETRY_INTERVAL_MS = 3000;

async function waitForDb(pool: Pool): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connection established.');
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Database not ready after ${MAX_RETRIES} attempts: ${err}`);
      }
      console.log(`Database not ready (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_INTERVAL_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  }
}

async function runMigrations(pool: Pool): Promise<void> {
  await waitForDb(pool);

  // Ensure the migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');

  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  } catch (err) {
    throw new Error(`Failed to read migrations directory "${migrationsDir}": ${err}`);
  }

  if (files.length === 0) {
    console.warn(`No SQL migration files found in ${migrationsDir}`);
    return;
  }

  for (const file of files) {
    const version = file.replace('.sql', '');

    const { rows } = await pool.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version]
    );
    if (rows.length > 0) {
      console.log(`Skipping already-applied migration: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    console.log(`Done: ${file}`);
  }

  console.log('All migrations complete.');
}

// When run directly (standalone migration tool)
if (require.main === module) {
  const pool = new Pool({ connectionString: env.databaseUrl });
  runMigrations(pool)
    .then(() => pool.end())
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

export { runMigrations };
