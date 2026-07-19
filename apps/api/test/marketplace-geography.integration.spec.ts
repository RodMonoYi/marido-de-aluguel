import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DemoActor } from '@marido/contracts';
import { ConfigService } from '@nestjs/config';
import { config as loadEnvironment } from 'dotenv';
import { Client } from 'pg';
import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseService, type QueryExecutor } from '../src/database/database.service';
import { MarketplaceService } from '../src/marketplace/marketplace.service';
import { PostgresMarketplaceRepository } from '../src/marketplace/postgres-marketplace.repository';

const CLIENT: DemoActor = {
  id: '019b0000-0000-7000-8000-000000000401',
  role: 'CLIENT',
  displayName: 'Marina Souza',
  professionalId: null,
};
const PROFESSIONAL: DemoActor = {
  id: '019b0000-0000-7000-8000-000000000402',
  role: 'PROFESSIONAL',
  displayName: 'Casa em Ordem',
  professionalId: '019b0000-0000-7000-8000-000000000102',
};
const CATEGORY_ID = '019b0000-0000-7000-8000-000000000004';

loadEnvironment({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const RUN_DATABASE_INTEGRATION = process.env.RUN_DATABASE_INTEGRATION === 'true';

function commandMetadata(label: string): { correlationId: string; idempotencyKey: string } {
  return {
    correlationId: uuidv7(),
    idempotencyKey: `${label}-${uuidv7()}`,
  };
}

function workflowInput(city: string) {
  const now = Date.now();
  const desiredStartsAt = new Date(now + 10 * 86_400_000);
  const desiredEndsAt = new Date(desiredStartsAt.getTime() + 12 * 3_600_000);

  return {
    request: {
      categoryId: CATEGORY_ID,
      title: 'Montagem de guarda-roupa residencial',
      description: 'Preciso montar um guarda-roupa novo, ainda embalado, no quarto principal.',
      locationApprox: {
        city,
        state: 'BA',
        district: 'Centro',
      },
      desiredWindow: {
        startsAt: desiredStartsAt.toISOString(),
        endsAt: desiredEndsAt.toISOString(),
        timezone: 'America/Bahia',
      },
      urgency: 'FLEXIBLE',
      budget: {
        minMinor: 15_000,
        maxMinor: 30_000,
        currency: 'BRL',
      },
      visibility: 'PRIVATE_MATCHED',
      proposalDeadline: new Date(now + 7 * 86_400_000).toISOString(),
    },
    proposal: {
      scope: 'Montagem completa do guarda-roupa conforme o manual fornecido pelo fabricante.',
      included: ['Montagem e regulagem das portas'],
      excluded: ['Fixação estrutural na parede'],
      amounts: {
        laborMinor: 18_000,
        materialsMinor: 0,
        travelMinor: 2_000,
        currency: 'BRL',
      },
      schedule: {
        startsAt: desiredStartsAt.toISOString(),
        endsAt: new Date(desiredStartsAt.getTime() + 2 * 3_600_000).toISOString(),
        timezone: 'America/Bahia',
      },
      validUntil: new Date(now + 6 * 86_400_000).toISOString(),
      guaranteeOffer: 'Ajustes de montagem por até trinta dias.',
    },
  } as const;
}

describe.runIf(RUN_DATABASE_INTEGRATION)('PRIVATE_MATCHED geographic integration', () => {
  let client: Client | undefined;
  let marketplace: MarketplaceService;
  let savepointSequence = 0;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for database integration tests');
    }

    const databaseClient = new Client({ connectionString });
    await databaseClient.connect();
    await databaseClient.query('BEGIN');
    client = databaseClient;

    for (const seedName of ['development.sql', 'marketplace-development.sql']) {
      const seed = await readFile(
        path.resolve(__dirname, `../src/database/seeds/${seedName}`),
        'utf8',
      );
      await databaseClient.query(seed);
    }

    const executor: QueryExecutor = {
      query: (text, values = []) => databaseClient.query(text, [...values]),
    };
    const database = {
      query: executor.query,
      async transaction<T>(
        callback: (transactionExecutor: QueryExecutor) => Promise<T>,
      ): Promise<T> {
        const savepoint = `repository_command_${++savepointSequence}`;
        await databaseClient.query(`SAVEPOINT ${savepoint}`);
        try {
          const result = await callback(executor);
          await databaseClient.query(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          await databaseClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await databaseClient.query(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      },
    } as unknown as DatabaseService;
    const repository = new PostgresMarketplaceRepository(database);
    marketplace = new MarketplaceService(
      new ConfigService({ NODE_ENV: 'test', DEMO_MODE: true }),
      repository,
    );
  });

  beforeEach(async () => {
    await client?.query('SAVEPOINT test_case');
  });

  afterEach(async () => {
    await client?.query('ROLLBACK TO SAVEPOINT test_case');
    await client?.query('RELEASE SAVEPOINT test_case');
  });

  afterAll(async () => {
    if (!client) return;
    await client.query('ROLLBACK');
    await client.end();
  });

  it('publishes only when category and active service area match the request city and state', async () => {
    const matchingInput = workflowInput('Salvador');
    const matching = await marketplace.createRequest(
      CLIENT,
      matchingInput.request,
      commandMetadata('geo-matching-create'),
    );
    const published = await marketplace.publishRequest(CLIENT, matching.id, {
      ...commandMetadata('geo-matching-publish'),
      expectedVersion: matching.version,
    });

    expect(published.status).toBe('PUBLISHED');
    await expect(marketplace.listRequests(PROFESSIONAL, 'opportunities')).resolves.toEqual([
      expect.objectContaining({ id: matching.id }),
    ]);

    const outsideInput = workflowInput('Feira de Santana');
    const outside = await marketplace.createRequest(
      CLIENT,
      outsideInput.request,
      commandMetadata('geo-outside-create'),
    );
    await expect(
      marketplace.publishRequest(CLIENT, outside.id, {
        ...commandMetadata('geo-outside-publish'),
        expectedVersion: outside.version,
      }),
    ).rejects.toMatchObject({
      response: { code: 'NO_ELIGIBLE_PROFESSIONALS' },
    });
  });

  it('revalidates the professional service area when the client accepts a proposal', async () => {
    const input = workflowInput('Salvador');
    const created = await marketplace.createRequest(
      CLIENT,
      input.request,
      commandMetadata('geo-accept-create'),
    );
    await marketplace.publishRequest(CLIENT, created.id, {
      ...commandMetadata('geo-accept-publish'),
      expectedVersion: created.version,
    });
    const proposal = await marketplace.createProposal(
      PROFESSIONAL,
      created.id,
      input.proposal,
      commandMetadata('geo-accept-proposal'),
    );

    await client?.query(
      `
        UPDATE marketplace.service_requests
        SET location_city = 'Feira de Santana'
        WHERE id = $1
      `,
      [created.id],
    );

    await expect(
      marketplace.acceptProposal(
        CLIENT,
        proposal.id,
        {
          revisionId: proposal.currentRevision.id,
          acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
        },
        {
          ...commandMetadata('geo-accept-command'),
          expectedVersion: proposal.version,
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'PROFESSIONAL_NOT_ELIGIBLE' },
    });
  });
});
