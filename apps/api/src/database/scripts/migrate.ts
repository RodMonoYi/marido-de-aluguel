import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';
import { Client } from 'pg';

async function migrate(): Promise<void> {
  config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
  config({ quiet: true });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [7_120_260_718]);
    await client.query('CREATE SCHEMA IF NOT EXISTS platform');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const directory = path.resolve(process.cwd(), 'src/database/migrations');
    const migrations = (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();

    for (const name of migrations) {
      const existing = await client.query<{ name: string }>(
        'SELECT name FROM platform.schema_migrations WHERE name = $1',
        [name],
      );
      if (existing.rowCount) {
        continue;
      }

      const sql = await readFile(path.join(directory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO platform.schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        process.stdout.write(`Applied ${name}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [7_120_260_718]).catch(() => undefined);
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown migration error';
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});
