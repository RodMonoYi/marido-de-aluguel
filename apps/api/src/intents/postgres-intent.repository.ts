import { Injectable } from '@nestjs/common';
import type { RestrictedIntent } from '@marido/contracts';
import type { QueryResultRow } from 'pg';

import { DatabaseService } from '../database/database.service';
import { IntentRepository, type CreateIntentInput } from './intent.repository';

interface IntentRow extends QueryResultRow {
  id: string;
  action: 'REQUEST_QUOTE';
  expiresAt: Date;
}

@Injectable()
export class PostgresIntentRepository extends IntentRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async create(input: CreateIntentInput): Promise<RestrictedIntent | null> {
    const result = await this.database.query<IntentRow>(
      `
        INSERT INTO discovery.restricted_intents (
          id, action, professional_id, service_id, status, expires_at
        )
        SELECT $1, $2, profile.id, service.id, 'ACTIVE', now() + interval '30 minutes'
        FROM catalog.professional_profiles profile
        JOIN catalog.services service
          ON service.professional_id = profile.id
        WHERE profile.id = $3
          AND service.id = $4
          AND profile.status = 'PUBLISHED'
          AND service.status = 'PUBLISHED'
        RETURNING id, action, expires_at AS "expiresAt"
      `,
      [input.id, input.action, input.professionalId, input.serviceId],
    );

    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          action: row.action,
          expiresAt: row.expiresAt.toISOString(),
        }
      : null;
  }
}
