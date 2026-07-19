import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';
import { Client } from 'pg';

import { assertSyntheticSeedAllowed } from './seed-environment';

async function seed(): Promise<void> {
  config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
  config({ quiet: true });

  assertSyntheticSeedAllowed(process.env);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const directory = path.resolve(process.cwd(), 'src/database/seeds');
    const seeds = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort((left, right) => {
        if (left === 'development.sql') return -1;
        if (right === 'development.sql') return 1;
        return left.localeCompare(right);
      });

    for (const name of seeds) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        process.stdout.write(`Applied synthetic seed ${name}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed error';
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
