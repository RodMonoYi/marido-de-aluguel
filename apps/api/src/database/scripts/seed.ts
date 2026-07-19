import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';
import { Client } from 'pg';

async function seed(): Promise<void> {
  config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
  config({ quiet: true });

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed is forbidden in production');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const sql = await readFile(
      path.resolve(process.cwd(), 'src/database/seeds/development.sql'),
      'utf8',
    );
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    process.stdout.write('Synthetic development catalog seeded\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed error';
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
