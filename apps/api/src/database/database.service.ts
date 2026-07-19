import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export interface QueryExecutor {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export type TransactionIsolation = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.get<number>('DATABASE_POOL_MAX', 10),
      application_name: 'marido-api',
      statement_timeout: 5_000,
      query_timeout: 6_000,
    });
  }

  query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, [...values]);
  }

  async transaction<T>(
    callback: (executor: QueryExecutor) => Promise<T>,
    isolation: TransactionIsolation = 'READ COMMITTED',
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await callback(this.executor(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  private executor(client: PoolClient): QueryExecutor {
    return {
      query: <Row extends QueryResultRow>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> => client.query<Row>(text, [...values]),
    };
  }
}
