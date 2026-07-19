import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type MarketplaceMaintenanceResult,
  PostgresMarketplaceRepository,
} from './postgres-marketplace.repository';

const MAINTENANCE_INTERVAL_MS = 30_000;
const MAINTENANCE_BATCH_SIZE = 100;

export interface MarketplaceMaintenanceMetrics {
  runs: number;
  failures: number;
  skippedRuns: number;
  expiredServiceRequests: number;
  expiredProposals: number;
  expiredHolds: number;
  deletedIdempotencyRecords: number;
  lastDurationMs: number | null;
  lastSuccessAt: string | null;
}

@Injectable()
export class MarketplaceMaintenanceWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MarketplaceMaintenanceWorker.name);
  private readonly metrics: MarketplaceMaintenanceMetrics = {
    runs: 0,
    failures: 0,
    skippedRuns: 0,
    expiredServiceRequests: 0,
    expiredProposals: 0,
    expiredHolds: 0,
    deletedIdempotencyRecords: 0,
    lastDurationMs: null,
    lastSuccessAt: null,
  };
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<MarketplaceMaintenanceResult> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: PostgresMarketplaceRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.getOrThrow<string>('NODE_ENV') === 'test') return;

    this.trigger();
    this.timer = setInterval(() => this.trigger(), MAINTENANCE_INTERVAL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.activeRun?.catch(() => undefined);
  }

  getMetrics(): Readonly<MarketplaceMaintenanceMetrics> {
    return { ...this.metrics };
  }

  async runOnce(): Promise<MarketplaceMaintenanceResult> {
    const startedAt = Date.now();
    try {
      const result = await this.repository.runMaintenanceBatch(MAINTENANCE_BATCH_SIZE);
      const completedAt = new Date();
      this.metrics.runs += 1;
      this.metrics.expiredServiceRequests += result.expiredServiceRequests;
      this.metrics.expiredProposals += result.expiredProposals;
      this.metrics.expiredHolds += result.expiredHolds;
      this.metrics.deletedIdempotencyRecords += result.deletedIdempotencyRecords;
      this.metrics.lastDurationMs = Date.now() - startedAt;
      this.metrics.lastSuccessAt = completedAt.toISOString();
      this.logger.log({
        event: 'marketplace_maintenance_completed',
        expired_service_requests: result.expiredServiceRequests,
        expired_proposals: result.expiredProposals,
        expired_holds: result.expiredHolds,
        deleted_idempotency_records: result.deletedIdempotencyRecords,
        duration_ms: this.metrics.lastDurationMs,
      });
      return result;
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.lastDurationMs = Date.now() - startedAt;
      this.logger.error({
        event: 'marketplace_maintenance_failed',
        error_type: error instanceof Error ? error.name : 'UnknownError',
        duration_ms: this.metrics.lastDurationMs,
      });
      throw error;
    }
  }

  private trigger(): void {
    if (this.activeRun) {
      this.metrics.skippedRuns += 1;
      return;
    }

    this.activeRun = this.runOnce();
    void this.activeRun
      .catch(() => undefined)
      .finally(() => {
        this.activeRun = null;
      });
  }
}
