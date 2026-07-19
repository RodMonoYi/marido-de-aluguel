import type { QueryExecutor } from '../database/database.service';

export async function hasCurrentPrivateMatchEligibility(
  executor: QueryExecutor,
  requestId: string,
  professionalId: string,
): Promise<boolean> {
  const result = await executor.query(
    `
      SELECT 1
      FROM marketplace.private_match_eligibility eligibility
      WHERE eligibility.request_id = $1
        AND eligibility.professional_id = $2
      LIMIT 1
    `,
    [requestId, professionalId],
  );

  return result.rows.length > 0;
}
