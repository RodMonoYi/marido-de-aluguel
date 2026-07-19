import { DEMO_ACCEPTANCE_POLICY, type ContractSnapshot, type DemoActor } from '@marido/contracts';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService, type QueryExecutor } from '../database/database.service';
import { digest } from './marketplace-integrity';
import { PostgresMarketplaceRepository } from './postgres-marketplace.repository';

const CUSTOMER: DemoActor = {
  id: '019b0000-0000-7000-8000-000000000401',
  role: 'CLIENT',
  displayName: 'Marina Souza',
  professionalId: null,
};

const CORRELATION_ID = '019b0000-0000-7000-8000-000000000601';

function contractSnapshot(): ContractSnapshot {
  return {
    request: {
      id: '019b0000-0000-7000-8000-000000000701',
      version: 2,
      title: 'Montagem de guarda-roupa de três portas',
      description: 'Montagem completa no quarto conforme o manual do fabricante.',
      category: {
        id: '019b0000-0000-7000-8000-000000000004',
        slug: 'montagem-de-moveis',
        name: 'Montagem de móveis',
      },
      locationApprox: {
        city: 'Salvador',
        state: 'BA',
        district: 'Pituba',
      },
      desiredWindow: {
        startsAt: '2030-06-10T12:00:00.000Z',
        endsAt: '2030-06-10T15:00:00.000Z',
        timezone: 'America/Bahia',
      },
      urgency: 'FLEXIBLE',
      budget: {
        minMinor: 15_000,
        maxMinor: 30_000,
        currency: 'BRL',
      },
    },
    parties: {
      customerActorId: CUSTOMER.id,
      professionalActorId: '019b0000-0000-7000-8000-000000000402',
      professionalProfileId: '019b0000-0000-7000-8000-000000000102',
    },
    proposal: {
      id: '019b0000-0000-7000-8000-000000000702',
      version: 1,
      revision: {
        id: '019b0000-0000-7000-8000-000000000703',
        version: 1,
        scope: 'Montagem completa e regulagem final das portas.',
        included: ['Montagem', 'Regulagem'],
        excluded: ['Fixação estrutural'],
        breakdown: {
          laborMinor: 18_000,
          materialsMinor: 0,
          travelMinor: 2_000,
          customerPlatformFeeMinor: 0,
          professionalCommissionMinor: 3_000,
          customerTotalMinor: 20_000,
          professionalNetEstimateMinor: 17_000,
          currency: 'BRL',
          policy: {
            code: 'DEMO_COMMISSION_15_PERCENT',
            version: 1,
            developmentOnly: true,
          },
        },
        schedule: {
          startsAt: '2030-06-10T12:00:00.000Z',
          endsAt: '2030-06-10T15:00:00.000Z',
          timezone: 'America/Bahia',
        },
        validUntil: '2030-06-05T12:00:00.000Z',
        policies: {
          cancellation: {
            code: 'DEMO_CANCELLATION_NO_CHARGE',
            version: 1,
            label: 'Demonstração sem cobrança: cancelamentos não geram taxa.',
          },
          guarantee: null,
        },
        createdAt: '2030-06-01T12:00:00.000Z',
      },
    },
    acceptance: {
      textVersion: DEMO_ACCEPTANCE_POLICY.version,
      text: DEMO_ACCEPTANCE_POLICY.text,
      textHash: DEMO_ACCEPTANCE_POLICY.textHash,
      acceptedAt: '2030-06-02T12:00:00.000Z',
    },
  };
}

function contractRow(snapshot: ContractSnapshot) {
  return {
    contractId: '019b0000-0000-7000-8000-000000000704',
    requestId: snapshot.request.id,
    proposalId: snapshot.proposal.id,
    acceptedRevisionId: snapshot.proposal.revision.id,
    contractStatus: 'AWAITING_PAYMENT' as const,
    contractVersion: 1,
    snapshot,
    snapshotHash: digest(snapshot),
    acceptanceTextVersion: snapshot.acceptance.textVersion,
    acceptedAt: new Date(snapshot.acceptance.acceptedAt),
    paymentOrderId: '019b0000-0000-7000-8000-000000000705',
    paymentOrderStatus: 'AWAITING_PAYMENT' as const,
    amountMinor: String(snapshot.proposal.revision.breakdown.customerTotalMinor),
    currency: 'BRL' as const,
    checkoutAvailable: false as const,
    paymentCreatedAt: new Date(snapshot.acceptance.acceptedAt),
    bookingHoldId: '019b0000-0000-7000-8000-000000000706',
    holdStatus: 'HOLD_ACTIVE' as const,
    holdStartsAt: new Date(snapshot.proposal.revision.schedule.startsAt),
    holdEndsAt: new Date(snapshot.proposal.revision.schedule.endsAt),
    holdTimezone: snapshot.proposal.revision.schedule.timezone,
    holdExpiresAt: new Date('2030-06-02T12:10:00.000Z'),
    holdCreatedAt: new Date(snapshot.acceptance.acceptedAt),
  };
}

function repositoryReturning(row: ReturnType<typeof contractRow>): PostgresMarketplaceRepository {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: row.contractId }] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [row] });
  const executor = { query: query as QueryExecutor['query'] };
  const database = {
    transaction: <Result>(
      callback: (executor: QueryExecutor) => Promise<Result>,
    ): Promise<Result> => callback(executor),
  } as unknown as DatabaseService;

  return new PostgresMarketplaceRepository(database);
}

describe('PostgresMarketplaceRepository contract snapshot integrity', () => {
  it('returns a contract when the persisted snapshot matches its digest', async () => {
    const row = contractRow(contractSnapshot());
    const repository = repositoryReturning(row);

    const view = await repository.findContract(row.contractId, CUSTOMER, CORRELATION_ID);

    expect(view?.contract.snapshotHash).toBe(row.snapshotHash);
    expect(view?.contract.snapshot).toEqual(row.snapshot);
  });

  it('checks immutable contract parties without locking ahead of hold expiration', async () => {
    const row = contractRow(contractSnapshot());
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: row.contractId }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [row] });
    const executor = { query: query as QueryExecutor['query'] };
    const database = {
      transaction: <Result>(
        callback: (executor: QueryExecutor) => Promise<Result>,
      ): Promise<Result> => callback(executor),
    } as unknown as DatabaseService;
    const repository = new PostgresMarketplaceRepository(database);

    await repository.findContract(row.contractId, CUSTOMER, CORRELATION_ID);

    const authorizationSql = query.mock.calls[0]?.[0] as string;
    const expirationSql = query.mock.calls[1]?.[0] as string;
    expect(authorizationSql).not.toContain('FOR UPDATE');
    expect(expirationSql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('fails closed when the persisted snapshot was changed without its digest', async () => {
    const original = contractSnapshot();
    const row = contractRow(original);
    row.snapshot = {
      ...original,
      request: {
        ...original.request,
        title: 'Conteúdo adulterado depois do aceite',
      },
    };
    const repository = repositoryReturning(row);

    await expect(repository.findContract(row.contractId, CUSTOMER, CORRELATION_ID)).rejects.toThrow(
      'Persisted contract snapshot failed its integrity check',
    );
  });

  it('does not project expiration that was not persisted', async () => {
    const row = contractRow(contractSnapshot());
    row.holdExpiresAt = new Date('2020-01-01T00:00:00.000Z');
    const repository = repositoryReturning(row);

    const view = await repository.findContract(row.contractId, CUSTOMER, CORRELATION_ID);

    expect(view).toMatchObject({
      contract: { status: 'AWAITING_PAYMENT' },
      paymentOrder: { status: 'AWAITING_PAYMENT' },
      bookingHold: { status: 'HOLD_ACTIVE' },
    });
  });

  it('locks maintenance batches with SKIP LOCKED and reports persisted changes', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            contractId: '019b0000-0000-7000-8000-000000000704',
            holdId: '019b0000-0000-7000-8000-000000000706',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [{}, {}] });
    const executor = { query: query as QueryExecutor['query'] };
    const database = {
      transaction: <Result>(
        callback: (executor: QueryExecutor) => Promise<Result>,
      ): Promise<Result> => callback(executor),
    } as unknown as DatabaseService;
    const repository = new PostgresMarketplaceRepository(database);

    await expect(repository.runMaintenanceBatch(25)).resolves.toEqual({
      expiredServiceRequests: 0,
      expiredProposals: 0,
      expiredHolds: 1,
      deletedIdempotencyRecords: 2,
    });

    const temporalSql = query.mock.calls[0]?.[0] as string;
    const holdSql = query.mock.calls[1]?.[0] as string;
    const cleanupSql = query.mock.calls[6]?.[0] as string;
    expect(temporalSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[0]?.[1]).toEqual([25]);
    expect(holdSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[1]?.[1]).toEqual([null, null, 25]);
    expect(cleanupSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[6]?.[1]).toEqual([25]);
  });

  it('expires a due request and its editable proposals with audited outbox events', async () => {
    const requestId = '019b0000-0000-7000-8000-000000000710';
    const proposalId = '019b0000-0000-7000-8000-000000000711';
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: requestId,
            version: 4,
            proposalDeadlineElapsed: true,
            desiredStartElapsed: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: proposalId,
            status: 'SENT',
            version: 2,
            validityElapsed: false,
            scheduleStartElapsed: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const executor = { query: query as QueryExecutor['query'] };
    const database = {
      transaction: <Result>(
        callback: (executor: QueryExecutor) => Promise<Result>,
      ): Promise<Result> => callback(executor),
    } as unknown as DatabaseService;
    const repository = new PostgresMarketplaceRepository(database);

    await expect(repository.runMaintenanceBatch(10)).resolves.toEqual({
      expiredServiceRequests: 1,
      expiredProposals: 1,
      expiredHolds: 0,
      deletedIdempotencyRecords: 0,
    });

    const requestLockSql = query.mock.calls[0]?.[0] as string;
    const proposalLockSql = query.mock.calls[1]?.[0] as string;
    expect(requestLockSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(proposalLockSql).toContain('ORDER BY proposal.id');
    expect(proposalLockSql).toContain('FOR UPDATE OF proposal');
    expect(query.mock.calls[2]?.[1]).toEqual([proposalId, 3]);
    expect(query.mock.calls[5]?.[1]).toEqual([requestId, 5]);

    expect(query.mock.calls[3]?.[1]).toEqual([
      expect.any(String),
      'ProposalExpired',
      'Proposal',
      proposalId,
      expect.any(String),
      expect.any(String),
      {
        requestId,
        reason: 'REQUEST_EXPIRED',
        status: 'EXPIRED',
        version: 3,
      },
    ]);
    expect(query.mock.calls[4]?.[1]).toEqual([
      expect.any(String),
      'ProposalExpired',
      'Proposal',
      proposalId,
      3,
      expect.any(String),
      {
        proposalId,
        requestId,
        reason: 'REQUEST_EXPIRED',
        status: 'EXPIRED',
      },
    ]);
    expect(query.mock.calls[6]?.[1]).toEqual([
      expect.any(String),
      'RequestExpired',
      'ServiceRequest',
      requestId,
      expect.any(String),
      expect.any(String),
      {
        reason: 'PROPOSAL_DEADLINE_ELAPSED',
        status: 'EXPIRED',
        version: 5,
      },
    ]);
  });

  it('expires only the proposal when its scheduled start elapsed', async () => {
    const requestId = '019b0000-0000-7000-8000-000000000712';
    const proposalId = '019b0000-0000-7000-8000-000000000713';
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: requestId,
            version: 2,
            proposalDeadlineElapsed: false,
            desiredStartElapsed: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: proposalId,
            status: 'REVISED',
            version: 3,
            validityElapsed: false,
            scheduleStartElapsed: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const executor = { query: query as QueryExecutor['query'] };
    const database = {
      transaction: <Result>(
        callback: (executor: QueryExecutor) => Promise<Result>,
      ): Promise<Result> => callback(executor),
    } as unknown as DatabaseService;
    const repository = new PostgresMarketplaceRepository(database);

    await expect(repository.runMaintenanceBatch(10)).resolves.toEqual({
      expiredServiceRequests: 0,
      expiredProposals: 1,
      expiredHolds: 0,
      deletedIdempotencyRecords: 0,
    });

    expect(query.mock.calls[2]?.[1]).toEqual([proposalId, 4]);
    expect(query.mock.calls[3]?.[1]?.[6]).toEqual({
      requestId,
      reason: 'SCHEDULE_START_ELAPSED',
      status: 'EXPIRED',
      version: 4,
    });
    expect(query.mock.calls[4]?.[1]?.[6]).toEqual({
      proposalId,
      requestId,
      reason: 'SCHEDULE_START_ELAPSED',
      status: 'EXPIRED',
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('UPDATE marketplace.service_requests')),
    ).toBe(false);
  });
});
