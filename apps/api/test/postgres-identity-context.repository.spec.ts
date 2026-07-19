import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../src/database/database.service';
import { PostgresIdentityContextRepository } from '../src/identity/postgres-identity-context.repository';

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('PostgresIdentityContextRepository', () => {
  it('resolves an active professional actor without consulting publication status', async () => {
    const query = vi.fn().mockResolvedValue(
      queryResult([
        {
          id: '019b0000-0000-7000-8000-000000000402',
          role: 'PROFESSIONAL',
          displayName: 'Casa em Ordem',
          professionalId: '019b0000-0000-7000-8000-000000000102',
        },
      ]),
    );
    const repository = new PostgresIdentityContextRepository({
      query,
    } as unknown as DatabaseService);

    await expect(
      repository.findActiveActor('019b0000-0000-7000-8000-000000000402'),
    ).resolves.toMatchObject({
      role: 'PROFESSIONAL',
      professionalId: '019b0000-0000-7000-8000-000000000102',
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("actor.status = 'ACTIVE'");
    expect(sql).not.toContain('professional_profiles');
    expect(sql).not.toContain("profile.status = 'PUBLISHED'");
  });

  it('lists all active identities without turning catalog status into authentication status', async () => {
    const query = vi.fn().mockResolvedValue(queryResult([]));
    const repository = new PostgresIdentityContextRepository({
      query,
    } as unknown as DatabaseService);

    await expect(repository.listActiveActors()).resolves.toEqual([]);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("actor.status = 'ACTIVE'");
    expect(sql).not.toContain('professional_profiles');
  });
});
