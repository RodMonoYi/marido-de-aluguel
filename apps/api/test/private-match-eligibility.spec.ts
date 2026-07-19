import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { QueryExecutor } from '../src/database/database.service';
import { hasCurrentPrivateMatchEligibility } from '../src/marketplace/private-match-eligibility';

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('private match eligibility', () => {
  it('uses the central current-state relation for command authorization', async () => {
    const query = vi.fn().mockResolvedValue(queryResult([{}]));
    const executor = { query } as unknown as QueryExecutor;

    await expect(
      hasCurrentPrivateMatchEligibility(executor, 'request-id', 'professional-id'),
    ).resolves.toBe(true);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('marketplace.private_match_eligibility');
    expect(query.mock.calls[0]?.[1]).toEqual(['request-id', 'professional-id']);
  });

  it('fails closed when the current-state relation has no match', async () => {
    const executor = {
      query: vi.fn().mockResolvedValue(queryResult([])),
    } as unknown as QueryExecutor;

    await expect(
      hasCurrentPrivateMatchEligibility(executor, 'request-id', 'professional-id'),
    ).resolves.toBe(false);
  });

  it('defines eligibility with active category, service, profile, identity and service area', async () => {
    const migration = await readFile(
      path.resolve(
        __dirname,
        '../src/database/migrations/005_private_match_geographic_eligibility.sql',
      ),
      'utf8',
    );

    expect(migration).toContain("service.status = 'PUBLISHED'");
    expect(migration).toContain("profile.status = 'PUBLISHED'");
    expect(migration).toContain("service_area.status = 'ACTIVE'");
    expect(migration).toContain("actor.status = 'ACTIVE'");
    expect(migration).toContain(
      'LOWER(BTRIM(service_area.city)) = LOWER(BTRIM(request.location_city))',
    );
    expect(migration).toContain(
      'UPPER(BTRIM(service_area.state)) = UPPER(BTRIM(request.location_state))',
    );
  });
});
