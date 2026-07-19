import { Injectable } from '@nestjs/common';
import type { DemoActor } from '@marido/contracts';
import type { QueryResultRow } from 'pg';

import { DatabaseService } from '../database/database.service';
import { IdentityContextRepository } from './identity-context.repository';

interface DemoActorRow extends QueryResultRow {
  id: string;
  role: DemoActor['role'];
  displayName: string;
  professionalId: string | null;
}

function toActor(row: DemoActorRow): DemoActor {
  if (row.role === 'CLIENT') {
    return {
      id: row.id,
      role: 'CLIENT',
      displayName: row.displayName,
      professionalId: null,
    };
  }

  if (!row.professionalId) {
    throw new Error('Professional demo actor has no professional context');
  }

  return {
    id: row.id,
    role: 'PROFESSIONAL',
    displayName: row.displayName,
    professionalId: row.professionalId,
  };
}

@Injectable()
export class PostgresIdentityContextRepository extends IdentityContextRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findActiveActor(id: string): Promise<DemoActor | null> {
    const result = await this.database.query<DemoActorRow>(
      `
        SELECT
          actor.id,
          actor.role,
          actor.display_name AS "displayName",
          actor.professional_id AS "professionalId"
        FROM identity.demo_actors actor
        WHERE actor.id = $1
          AND actor.status = 'ACTIVE'
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? toActor(row) : null;
  }

  async listActiveActors(): Promise<DemoActor[]> {
    const result = await this.database.query<DemoActorRow>(`
      SELECT
        actor.id,
        actor.role,
        actor.display_name AS "displayName",
        actor.professional_id AS "professionalId"
      FROM identity.demo_actors actor
      WHERE actor.status = 'ACTIVE'
      ORDER BY actor.role, actor.display_name, actor.id
    `);

    return result.rows.map(toActor);
  }
}
