import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DemoActor, Proposal, ServiceRequest } from '@marido/contracts';
import { config as loadEnvironment } from 'dotenv';
import { Client, type QueryResultRow } from 'pg';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../src/database/database.service';
import { MarketplaceService } from '../src/marketplace/marketplace.service';
import { PostgresMarketplaceRepository } from '../src/marketplace/postgres-marketplace.repository';

loadEnvironment({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? '';
const CLIENT_ID = '019b0000-0000-7000-8000-000000000401';
const PRIMARY_PROFESSIONAL_ACTOR_ID = '019b0000-0000-7000-8000-000000000402';
const SECONDARY_PROFESSIONAL_ACTOR_ID = '019b0000-0000-7000-8000-000000000404';
const PRIMARY_PROFESSIONAL_ID = '019b0000-0000-7000-8000-000000000102';
const SECONDARY_PROFESSIONAL_ID = '019b0000-0000-7000-8000-000000000101';
const CATEGORY_ID = '019b0000-0000-7000-8000-000000000004';
const PRIMARY_RESOURCE_ID = '019b0000-0000-7000-8000-000000000501';

const clientActor: DemoActor = {
  id: CLIENT_ID,
  role: 'CLIENT',
  displayName: 'Marina Souza',
  professionalId: null,
};

const primaryProfessionalActor: DemoActor = {
  id: PRIMARY_PROFESSIONAL_ACTOR_ID,
  role: 'PROFESSIONAL',
  displayName: 'Casa em Ordem',
  professionalId: PRIMARY_PROFESSIONAL_ID,
};

const secondaryProfessionalActor: DemoActor = {
  id: SECONDARY_PROFESSIONAL_ACTOR_ID,
  role: 'PROFESSIONAL',
  displayName: 'Ana Reis',
  professionalId: SECONDARY_PROFESSIONAL_ID,
};

interface AcceptanceCountsRow extends QueryResultRow {
  contractCount: number;
  paymentOrderCount: number;
  activeHoldCount: number;
  convertedProposalCount: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface MaintenanceStatesRow extends QueryResultRow {
  contractStatus: string;
  paymentOrderStatus: string;
  holdStatus: string;
}

interface IdempotencyStateRow extends QueryResultRow {
  count: number;
  status: string;
  discardedPayloadPresent: boolean;
  expiresInFuture: boolean;
}

interface TemporalStateRow extends QueryResultRow {
  requestStatus: ServiceRequest['status'];
  requestVersion: number;
  proposalId: string;
  proposalStatus: Proposal['status'];
  proposalVersion: number;
}

interface TemporalTransitionCountRow extends QueryResultRow {
  requestAuditCount: number;
  requestOutboxCount: number;
  proposalAuditCount: number;
  proposalOutboxCount: number;
}

interface Schedule {
  startsAt: string;
  endsAt: string;
  timezone: 'America/Bahia';
}

interface AcceptanceAttempt {
  proposal: Proposal;
  idempotencyKey: string;
  correlationId: string;
}

function commandMetadata(scope: string): {
  idempotencyKey: string;
  correlationId: string;
} {
  return {
    idempotencyKey: `${scope}-${uuidv7()}`,
    correlationId: uuidv7(),
  };
}

function futureSchedule(daysFromNow: number): Schedule {
  const startsAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1_000);
  startsAt.setUTCSeconds(0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1_000);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: 'America/Bahia',
  };
}

function relativeTo(isoTimestamp: string, days: number): string {
  return new Date(Date.parse(isoTimestamp) + days * 24 * 60 * 60 * 1_000).toISOString();
}

function httpErrorDetails(error: unknown): {
  code: string | undefined;
  retryable: boolean | undefined;
  status: number;
} {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  const response = exception.getResponse();
  const body = typeof response === 'object' && response !== null ? response : {};
  return {
    code: 'code' in body && typeof body.code === 'string' ? body.code : undefined,
    retryable:
      'retryable' in body && typeof body.retryable === 'boolean' ? body.retryable : undefined,
    status: exception.getStatus(),
  };
}

describe.skipIf(!BASE_DATABASE_URL)('concorrência do marketplace com PostgreSQL real', () => {
  const databaseName = `marketplace_it_${process.pid}_${Date.now()}`;
  let adminUrl = '';
  let testDatabaseUrl = '';
  let database: DatabaseService;
  let repository: PostgresMarketplaceRepository;
  let marketplace: MarketplaceService;

  beforeAll(async () => {
    const baseUrl = new URL(BASE_DATABASE_URL);
    const adminDatabaseUrl = new URL(baseUrl);
    adminDatabaseUrl.pathname = '/postgres';
    adminUrl = adminDatabaseUrl.toString();

    const isolatedDatabaseUrl = new URL(baseUrl);
    isolatedDatabaseUrl.pathname = `/${databaseName}`;
    testDatabaseUrl = isolatedDatabaseUrl.toString();

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    } finally {
      await admin.end();
    }

    await applySqlFiles(testDatabaseUrl, 'migrations');
    await applySqlFiles(testDatabaseUrl, 'seeds');
    await prepareConcurrencyFixture(testDatabaseUrl);

    const configuration = new ConfigService({
      DATABASE_URL: testDatabaseUrl,
      DATABASE_POOL_MAX: 8,
      NODE_ENV: 'test',
      DEMO_MODE: true,
    });
    database = new DatabaseService(configuration);
    repository = new PostgresMarketplaceRepository(database);
    marketplace = new MarketplaceService(configuration, repository);
  }, 60_000);

  afterAll(async () => {
    if (database) {
      await database.onApplicationShutdown();
    }
    if (!adminUrl) return;

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it('serializa duas propostas irmãs e devolve o conflito como repetível', async () => {
    const schedule = futureSchedule(8);
    const request = await createPublishedRequest(marketplace, 'irmãs concorrentes', schedule);
    const proposals = await Promise.all([
      createProposal(
        marketplace,
        primaryProfessionalActor,
        request,
        schedule,
        'Montagem completa pela equipe Casa em Ordem.',
      ),
      createProposal(
        marketplace,
        secondaryProfessionalActor,
        request,
        schedule,
        'Montagem completa pela profissional Ana Reis.',
      ),
    ]);
    const attempts = proposals.map<AcceptanceAttempt>((proposal, index) => ({
      proposal,
      ...commandMetadata(`accept-sibling-${index}`),
    }));

    const outcomes = await Promise.allSettled(
      attempts.map((attempt) =>
        marketplace.acceptProposal(
          clientActor,
          attempt.proposal.id,
          {
            revisionId: attempt.proposal.currentRevision.id,
            acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
          },
          {
            expectedVersion: attempt.proposal.version,
            idempotencyKey: attempt.idempotencyKey,
            correlationId: attempt.correlationId,
          },
        ),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejectedIndex = outcomes.findIndex((outcome) => outcome.status === 'rejected');
    expect(rejectedIndex).toBeGreaterThanOrEqual(0);
    const rejected = outcomes[rejectedIndex] as PromiseRejectedResult;
    expect(httpErrorDetails(rejected.reason)).toEqual({
      code: 'TRANSACTION_RETRY_REQUIRED',
      retryable: true,
      status: 409,
    });

    const counts = await database.query<AcceptanceCountsRow>(
      `
          SELECT
            (
              SELECT COUNT(*)::int
              FROM contracting.contracts contract
              WHERE contract.request_id = $1
            ) AS "contractCount",
            (
              SELECT COUNT(*)::int
              FROM payments.payment_orders payment_order
              JOIN contracting.contracts contract
                ON contract.id = payment_order.contract_id
              WHERE contract.request_id = $1
            ) AS "paymentOrderCount",
            (
              SELECT COUNT(*)::int
              FROM scheduling.calendar_reservations reservation
              JOIN contracting.contracts contract
                ON contract.id = reservation.contract_id
              WHERE contract.request_id = $1
                AND reservation.status = 'HOLD_ACTIVE'
            ) AS "activeHoldCount",
            (
              SELECT COUNT(*)::int
              FROM marketplace.proposals proposal
              WHERE proposal.request_id = $1
                AND proposal.status = 'CONVERTED'
            ) AS "convertedProposalCount"
        `,
      [request.id],
    );
    expect(counts.rows[0]).toEqual({
      contractCount: 1,
      paymentOrderCount: 1,
      activeHoldCount: 1,
      convertedProposalCount: 1,
    });

    const losingAttempt = attempts[rejectedIndex];
    if (!losingAttempt) throw new Error('A tentativa perdedora não foi identificada.');
    const staleClaim = await database.query<CountRow>(
      `
          SELECT COUNT(*)::int AS count
          FROM platform.idempotency_records
          WHERE actor_id = $1
            AND operation = $2
            AND idempotency_key = $3
        `,
      [
        clientActor.id,
        `proposal:${losingAttempt.proposal.id}:accept`,
        losingAttempt.idempotencyKey,
      ],
    );
    expect(staleClaim.rows[0]?.count).toBe(0);

    const safeRetryError = await marketplace
      .acceptProposal(
        clientActor,
        losingAttempt.proposal.id,
        {
          revisionId: losingAttempt.proposal.currentRevision.id,
          acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
        },
        {
          expectedVersion: losingAttempt.proposal.version,
          idempotencyKey: losingAttempt.idempotencyKey,
          correlationId: losingAttempt.correlationId,
        },
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(httpErrorDetails(safeRetryError).status).toBe(409);
  }, 30_000);

  it('mantém uma única reserva quando o mesmo profissional é aceito em horários sobrepostos', async () => {
    const schedule = futureSchedule(16);
    const requests = await Promise.all([
      createPublishedRequest(marketplace, 'reserva alfa', schedule),
      createPublishedRequest(marketplace, 'reserva beta', schedule),
    ]);
    const proposals = await Promise.all(
      requests.map((request, index) =>
        createProposal(
          marketplace,
          primaryProfessionalActor,
          request,
          schedule,
          `Montagem completa no pedido concorrente ${index + 1}.`,
        ),
      ),
    );
    const attempts = proposals.map<AcceptanceAttempt>((proposal, index) => ({
      proposal,
      ...commandMetadata(`accept-overlap-${index}`),
    }));

    const outcomes = await Promise.allSettled(
      attempts.map((attempt) =>
        marketplace.acceptProposal(
          clientActor,
          attempt.proposal.id,
          {
            revisionId: attempt.proposal.currentRevision.id,
            acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
          },
          {
            expectedVersion: attempt.proposal.version,
            idempotencyKey: attempt.idempotencyKey,
            correlationId: attempt.correlationId,
          },
        ),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejectedIndex = outcomes.findIndex((outcome) => outcome.status === 'rejected');
    expect(rejectedIndex).toBeGreaterThanOrEqual(0);
    const rejected = outcomes[rejectedIndex] as PromiseRejectedResult;
    const conflict = httpErrorDetails(rejected.reason);
    expect(conflict.status).toBe(409);
    expect(['SLOT_UNAVAILABLE', 'TRANSACTION_RETRY_REQUIRED']).toContain(conflict.code);

    const losingAttempt = attempts[rejectedIndex];
    if (!losingAttempt) throw new Error('A tentativa perdedora não foi identificada.');
    const retryError = await marketplace
      .acceptProposal(
        clientActor,
        losingAttempt.proposal.id,
        {
          revisionId: losingAttempt.proposal.currentRevision.id,
          acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
        },
        {
          expectedVersion: losingAttempt.proposal.version,
          idempotencyKey: losingAttempt.idempotencyKey,
          correlationId: losingAttempt.correlationId,
        },
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(httpErrorDetails(retryError)).toMatchObject({
      code: 'SLOT_UNAVAILABLE',
      status: 409,
    });

    const requestIds = requests.map((request) => request.id);
    const aggregateCounts = await database.query<AcceptanceCountsRow>(
      `
          SELECT
            (
              SELECT COUNT(*)::int
              FROM contracting.contracts contract
              WHERE contract.request_id = ANY($1::uuid[])
            ) AS "contractCount",
            (
              SELECT COUNT(*)::int
              FROM payments.payment_orders payment_order
              JOIN contracting.contracts contract
                ON contract.id = payment_order.contract_id
              WHERE contract.request_id = ANY($1::uuid[])
            ) AS "paymentOrderCount",
            (
              SELECT COUNT(*)::int
              FROM scheduling.calendar_reservations reservation
              WHERE reservation.resource_id = $2
                AND reservation.status = 'HOLD_ACTIVE'
                AND reservation.starts_at = $3
                AND reservation.ends_at = $4
            ) AS "activeHoldCount",
            (
              SELECT COUNT(*)::int
              FROM marketplace.proposals proposal
              WHERE proposal.request_id = ANY($1::uuid[])
                AND proposal.status = 'CONVERTED'
            ) AS "convertedProposalCount"
        `,
      [requestIds, PRIMARY_RESOURCE_ID, schedule.startsAt, schedule.endsAt],
    );
    expect(aggregateCounts.rows[0]).toEqual({
      contractCount: 1,
      paymentOrderCount: 1,
      activeHoldCount: 1,
      convertedProposalCount: 1,
    });
  }, 30_000);

  it('expira em paralelo com a leitura sem deadlock 40P01 ou estado apenas projetado', async () => {
    const schedule = futureSchedule(24);
    const serviceRequest = await createPublishedRequest(
      marketplace,
      'expiração concorrente',
      schedule,
    );
    const proposal = await createProposal(
      marketplace,
      primaryProfessionalActor,
      serviceRequest,
      schedule,
      'Montagem completa para validar expiração concorrente do hold.',
    );
    const acceptance = await marketplace.acceptProposal(
      clientActor,
      proposal.id,
      {
        revisionId: proposal.currentRevision.id,
        acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
      },
      {
        expectedVersion: proposal.version,
        ...commandMetadata('accept-expiration-race'),
      },
    );
    await database.query(
      `
        UPDATE scheduling.calendar_reservations
        SET
          created_at = now() - interval '20 minutes',
          expires_at = now() - interval '10 minutes'
        WHERE contract_id = $1
      `,
      [acceptance.contract.id],
    );

    const outcomes = await Promise.allSettled([
      repository.findContract(acceptance.contract.id, clientActor, uuidv7()),
      repository.runMaintenanceBatch(100),
    ]);

    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const persisted = await database.query<MaintenanceStatesRow>(
      `
        SELECT
          contract.status AS "contractStatus",
          payment.status AS "paymentOrderStatus",
          hold.status AS "holdStatus"
        FROM contracting.contracts contract
        JOIN payments.payment_orders payment ON payment.contract_id = contract.id
        JOIN scheduling.calendar_reservations hold ON hold.contract_id = contract.id
        WHERE contract.id = $1
      `,
      [acceptance.contract.id],
    );
    expect(persisted.rows[0]).toEqual({
      contractStatus: 'CANCELLED',
      paymentOrderStatus: 'EXPIRED',
      holdStatus: 'HOLD_EXPIRED',
    });
  }, 30_000);

  it('reaproveita chave vencida e remove o payload após a janela de retenção', async () => {
    const schedule = futureSchedule(28);
    const idempotencyKey = `expired-reuse-${uuidv7()}`;
    await database.query(
      `
        INSERT INTO platform.idempotency_records (
          actor_id,
          operation,
          idempotency_key,
          request_hash,
          status,
          response_payload,
          created_at,
          completed_at,
          expires_at
        )
        VALUES (
          $1,
          'service-request:create',
          $2,
          repeat('a', 64),
          'COMPLETED',
          '{"discardedPrivatePayload": true}'::jsonb,
          now() - interval '2 days',
          now() - interval '2 days',
          now() - interval '1 day'
        )
      `,
      [clientActor.id, idempotencyKey],
    );

    await marketplace.createRequest(
      clientActor,
      {
        categoryId: CATEGORY_ID,
        title: 'Pedido com chave idempotente reaproveitada',
        description: 'Pedido sintético para validar takeover e retenção limitada do payload.',
        locationApprox: {
          city: 'Salvador',
          state: 'BA',
          district: 'Pituba',
        },
        desiredWindow: schedule,
        urgency: 'FLEXIBLE',
        budget: null,
        visibility: 'PRIVATE_MATCHED',
        proposalDeadline: relativeTo(schedule.startsAt, -2),
      },
      {
        idempotencyKey,
        correlationId: uuidv7(),
      },
    );

    const reused = await database.query<IdempotencyStateRow>(
      `
        SELECT
          1::int AS count,
          status,
          response_payload ? 'discardedPrivatePayload' AS "discardedPayloadPresent",
          expires_at > now() AS "expiresInFuture"
        FROM platform.idempotency_records
        WHERE actor_id = $1
          AND operation = 'service-request:create'
          AND idempotency_key = $2
      `,
      [clientActor.id, idempotencyKey],
    );
    expect(reused.rows[0]).toEqual({
      count: 1,
      status: 'COMPLETED',
      discardedPayloadPresent: false,
      expiresInFuture: true,
    });

    await database.query(
      `
        UPDATE platform.idempotency_records
        SET
          created_at = now() - interval '2 days',
          completed_at = now() - interval '2 days',
          expires_at = now() - interval '1 day'
        WHERE actor_id = $1
          AND operation = 'service-request:create'
          AND idempotency_key = $2
      `,
      [clientActor.id, idempotencyKey],
    );
    const maintenance = await repository.runMaintenanceBatch(100);
    expect(maintenance.deletedIdempotencyRecords).toBeGreaterThanOrEqual(1);
    const deleted = await database.query<CountRow>(
      `
        SELECT COUNT(*)::int AS count
        FROM platform.idempotency_records
        WHERE actor_id = $1
          AND operation = 'service-request:create'
          AND idempotency_key = $2
      `,
      [clientActor.id, idempotencyKey],
    );
    expect(deleted.rows[0]?.count).toBe(0);
  }, 30_000);

  it('materializa a validade vencida da proposta sem encerrar antecipadamente o pedido', async () => {
    const schedule = futureSchedule(32);
    const request = await createPublishedRequest(
      marketplace,
      'validade temporal da proposta',
      schedule,
    );
    const validUntilTimestamp = Date.now() + 1_000;
    const proposal = await marketplace.createProposal(
      primaryProfessionalActor,
      request.id,
      {
        scope: 'Montagem completa para validar a expiração persistida por validade da proposta.',
        included: ['Montagem e conferência final'],
        excluded: ['Fornecimento de materiais adicionais'],
        amounts: {
          laborMinor: 18000,
          materialsMinor: 2000,
          travelMinor: 1000,
          currency: 'BRL',
        },
        schedule,
        validUntil: new Date(validUntilTimestamp).toISOString(),
        guaranteeOffer: 'Garantia de trinta dias para ajustes da montagem.',
      },
      commandMetadata('create-short-lived-proposal'),
    );

    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, validUntilTimestamp - Date.now() + 100)),
    );

    await expect(repository.runMaintenanceBatch(100)).resolves.toMatchObject({
      expiredServiceRequests: 0,
      expiredProposals: 1,
    });

    const state = await database.query<TemporalStateRow>(
      `
        SELECT
          request.status AS "requestStatus",
          request.version AS "requestVersion",
          proposal.id AS "proposalId",
          proposal.status AS "proposalStatus",
          proposal.version AS "proposalVersion"
        FROM marketplace.service_requests request
        JOIN marketplace.proposals proposal ON proposal.request_id = request.id
        WHERE request.id = $1
          AND proposal.id = $2
      `,
      [request.id, proposal.id],
    );
    expect(state.rows[0]).toEqual({
      requestStatus: 'PUBLISHED',
      requestVersion: request.version,
      proposalId: proposal.id,
      proposalStatus: 'EXPIRED',
      proposalVersion: proposal.version + 1,
    });

    const counts = await temporalTransitionCounts(database, request.id);
    expect(counts).toEqual({
      requestAuditCount: 0,
      requestOutboxCount: 0,
      proposalAuditCount: 1,
      proposalOutboxCount: 1,
    });

    await expect(repository.runMaintenanceBatch(100)).resolves.toMatchObject({
      expiredServiceRequests: 0,
      expiredProposals: 0,
    });
    await expect(temporalTransitionCounts(database, request.id)).resolves.toEqual(counts);
  }, 30_000);

  it('expira pedido e propostas irmãs uma única vez sob workers concorrentes', async () => {
    const schedule = futureSchedule(36);
    const request = await createPublishedRequest(marketplace, 'prazo temporal do pedido', schedule);
    const proposals = await Promise.all([
      createProposal(
        marketplace,
        primaryProfessionalActor,
        request,
        schedule,
        'Montagem completa da primeira proposta antes da expiração do pedido.',
      ),
      createProposal(
        marketplace,
        secondaryProfessionalActor,
        request,
        schedule,
        'Montagem completa da segunda proposta antes da expiração do pedido.',
      ),
    ]);
    await database.query(
      `
        UPDATE marketplace.service_requests
        SET proposal_deadline = now() - interval '1 minute'
        WHERE id = $1
      `,
      [request.id],
    );

    const concurrentResults = await Promise.all([
      repository.runMaintenanceBatch(100),
      repository.runMaintenanceBatch(100),
    ]);
    expect(
      concurrentResults.reduce((total, result) => total + result.expiredServiceRequests, 0),
    ).toBe(1);
    expect(concurrentResults.reduce((total, result) => total + result.expiredProposals, 0)).toBe(2);

    const state = await database.query<TemporalStateRow>(
      `
        SELECT
          request.status AS "requestStatus",
          request.version AS "requestVersion",
          proposal.id AS "proposalId",
          proposal.status AS "proposalStatus",
          proposal.version AS "proposalVersion"
        FROM marketplace.service_requests request
        JOIN marketplace.proposals proposal ON proposal.request_id = request.id
        WHERE request.id = $1
        ORDER BY proposal.id
      `,
      [request.id],
    );
    expect(state.rows).toHaveLength(2);
    for (const row of state.rows) {
      const proposal = proposals.find((candidate) => candidate.id === row.proposalId);
      if (!proposal) throw new Error('Proposta expirada não pertence ao pedido do teste.');
      expect(row).toEqual({
        requestStatus: 'EXPIRED',
        requestVersion: request.version + 1,
        proposalId: proposal.id,
        proposalStatus: 'EXPIRED',
        proposalVersion: proposal.version + 1,
      });
    }

    const counts = await temporalTransitionCounts(database, request.id);
    expect(counts).toEqual({
      requestAuditCount: 1,
      requestOutboxCount: 1,
      proposalAuditCount: 2,
      proposalOutboxCount: 2,
    });
    await expect(repository.runMaintenanceBatch(100)).resolves.toMatchObject({
      expiredServiceRequests: 0,
      expiredProposals: 0,
    });
    await expect(temporalTransitionCounts(database, request.id)).resolves.toEqual(counts);
  }, 30_000);
});

async function temporalTransitionCounts(
  database: DatabaseService,
  requestId: string,
): Promise<TemporalTransitionCountRow> {
  const result = await database.query<TemporalTransitionCountRow>(
    `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM audit.audit_logs audit
          WHERE audit.resource_type = 'ServiceRequest'
            AND audit.resource_id = $1
            AND audit.action = 'RequestExpired'
        ) AS "requestAuditCount",
        (
          SELECT COUNT(*)::int
          FROM platform.outbox_events event
          WHERE event.aggregate_type = 'ServiceRequest'
            AND event.aggregate_id = $1
            AND event.event_type = 'RequestExpired'
        ) AS "requestOutboxCount",
        (
          SELECT COUNT(*)::int
          FROM audit.audit_logs audit
          JOIN marketplace.proposals proposal ON proposal.id = audit.resource_id
          WHERE proposal.request_id = $1
            AND audit.resource_type = 'Proposal'
            AND audit.action = 'ProposalExpired'
        ) AS "proposalAuditCount",
        (
          SELECT COUNT(*)::int
          FROM platform.outbox_events event
          JOIN marketplace.proposals proposal ON proposal.id = event.aggregate_id
          WHERE proposal.request_id = $1
            AND event.aggregate_type = 'Proposal'
            AND event.event_type = 'ProposalExpired'
        ) AS "proposalOutboxCount"
    `,
    [requestId],
  );
  const counts = result.rows[0];
  if (!counts) throw new Error('Contadores temporais não foram retornados.');
  return counts;
}

async function applySqlFiles(
  connectionString: string,
  kind: 'migrations' | 'seeds',
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const directory = path.resolve(process.cwd(), `src/database/${kind}`);
    const names = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort((left, right) => {
        if (kind === 'seeds' && left === 'development.sql') return -1;
        if (kind === 'seeds' && right === 'development.sql') return 1;
        return left.localeCompare(right);
      });

    for (const name of names) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

async function prepareConcurrencyFixture(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      `
        INSERT INTO catalog.services (
          id,
          professional_id,
          category_id,
          slug,
          name,
          summary,
          pricing_model,
          price_from_minor,
          unit_label,
          modalities,
          duration_minutes,
          is_featured,
          status
        )
        VALUES (
          '019b0000-0000-7000-8000-000000000299',
          $1,
          $2,
          'montagem-concorrencia-integracao',
          'Montagem para teste de concorrência',
          'Serviço sintético restrito ao banco temporário do teste de integração.',
          'FIXED',
          12000,
          'por montagem',
          ARRAY['AT_CLIENT'],
          120,
          false,
          'PUBLISHED'
        )
      `,
      [SECONDARY_PROFESSIONAL_ID, CATEGORY_ID],
    );
    await client.query(`
      CREATE OR REPLACE FUNCTION contracting.test_delay_contract_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        PERFORM pg_sleep(0.2);
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER test_delay_contract_insert
        BEFORE INSERT ON contracting.contracts
        FOR EACH ROW EXECUTE FUNCTION contracting.test_delay_contract_insert();
    `);
  } finally {
    await client.end();
  }
}

async function createPublishedRequest(
  marketplace: MarketplaceService,
  label: string,
  schedule: Schedule,
): Promise<ServiceRequest> {
  const created = await marketplace.createRequest(
    clientActor,
    {
      categoryId: CATEGORY_ID,
      title: `Pedido de montagem ${label}`,
      description: `Pedido de integração para validar concorrência de ${label} no PostgreSQL.`,
      locationApprox: {
        city: 'Salvador',
        state: 'BA',
        district: 'Pituba',
      },
      desiredWindow: schedule,
      urgency: 'FLEXIBLE',
      budget: {
        minMinor: 10000,
        maxMinor: 50000,
        currency: 'BRL',
      },
      visibility: 'PRIVATE_MATCHED',
      proposalDeadline: relativeTo(schedule.startsAt, -2),
    },
    commandMetadata('create-request'),
  );

  return marketplace.publishRequest(clientActor, created.id, {
    expectedVersion: created.version,
    ...commandMetadata('publish-request'),
  });
}

function createProposal(
  marketplace: MarketplaceService,
  actor: DemoActor,
  request: ServiceRequest,
  schedule: Schedule,
  scope: string,
): Promise<Proposal> {
  return marketplace.createProposal(
    actor,
    request.id,
    {
      scope,
      included: ['Montagem e conferência final'],
      excluded: ['Fornecimento de materiais adicionais'],
      amounts: {
        laborMinor: 18000,
        materialsMinor: 2000,
        travelMinor: 1000,
        currency: 'BRL',
      },
      schedule,
      validUntil: relativeTo(schedule.startsAt, -3),
      guaranteeOffer: 'Garantia de trinta dias para ajustes da montagem.',
    },
    commandMetadata('create-proposal'),
  );
}
