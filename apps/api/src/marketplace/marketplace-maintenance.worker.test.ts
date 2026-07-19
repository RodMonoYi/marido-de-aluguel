import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketplaceMaintenanceWorker } from './marketplace-maintenance.worker';
import { PostgresMarketplaceRepository } from './postgres-marketplace.repository';

describe('MarketplaceMaintenanceWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('runs a batch and exposes aggregate counters without payload data', async () => {
    const runMaintenanceBatch = vi.fn().mockResolvedValue({
      expiredServiceRequests: 2,
      expiredProposals: 5,
      expiredHolds: 3,
      deletedIdempotencyRecords: 7,
    });
    const worker = new MarketplaceMaintenanceWorker(new ConfigService({ NODE_ENV: 'test' }), {
      runMaintenanceBatch,
    } as unknown as PostgresMarketplaceRepository);

    await expect(worker.runOnce()).resolves.toEqual({
      expiredServiceRequests: 2,
      expiredProposals: 5,
      expiredHolds: 3,
      deletedIdempotencyRecords: 7,
    });
    expect(runMaintenanceBatch).toHaveBeenCalledWith(100);
    expect(worker.getMetrics()).toMatchObject({
      runs: 1,
      failures: 0,
      expiredServiceRequests: 2,
      expiredProposals: 5,
      expiredHolds: 3,
      deletedIdempotencyRecords: 7,
      lastSuccessAt: expect.any(String),
    });
  });

  it('does not start the periodic timer automatically in tests', () => {
    const runMaintenanceBatch = vi.fn();
    const worker = new MarketplaceMaintenanceWorker(new ConfigService({ NODE_ENV: 'test' }), {
      runMaintenanceBatch,
    } as unknown as PostgresMarketplaceRepository);

    worker.onApplicationBootstrap();

    expect(runMaintenanceBatch).not.toHaveBeenCalled();
  });

  it('records failures and rethrows them to the caller', async () => {
    const runMaintenanceBatch = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const worker = new MarketplaceMaintenanceWorker(new ConfigService({ NODE_ENV: 'test' }), {
      runMaintenanceBatch,
    } as unknown as PostgresMarketplaceRepository);

    await expect(worker.runOnce()).rejects.toThrow('database unavailable');
    expect(worker.getMetrics()).toMatchObject({
      runs: 0,
      failures: 1,
      expiredServiceRequests: 0,
      expiredProposals: 0,
      expiredHolds: 0,
      deletedIdempotencyRecords: 0,
    });
  });
});
