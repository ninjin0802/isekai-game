import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from '../config/env';

async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
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
