import type { ProposalRevision } from '@marido/contracts';

import { formatDateTime, formatMoney } from '@/lib/format';

interface ProposalRevisionHistoryProps {
  revisions: ProposalRevision[];
  currentRevisionId: string;
}

export function ProposalRevisionHistory({
  revisions,
  currentRevisionId,
}: ProposalRevisionHistoryProps) {
  const ordered = [...revisions].sort((left, right) => right.version - left.version);

  return (
    <section className="revision-history" aria-labelledby="revision-history-title">
      <div className="revision-history-heading">
        <div>
          <p className="eyebrow">Histórico append-only</p>
          <h2 id="revision-history-title">Versões anteriores continuam consultáveis</h2>
        </div>
        <span>
          {ordered.length} {ordered.length === 1 ? 'versão' : 'versões'}
        </span>
      </div>
      <div className="revision-list">
        {ordered.map((revision) => {
          const current = revision.id === currentRevisionId;
          return (
            <details key={revision.id} open={current}>
              <summary>
                <span>
                  <strong>Versão {revision.version}</strong>
                  <small>
                    {formatDateTime(revision.createdAt)}
                    {current ? ' · versão atual' : ''}
                  </small>
                </span>
                <strong>{formatMoney(revision.breakdown.customerTotalMinor)}</strong>
              </summary>
              <div className="revision-content">
                <p>{revision.scope}</p>
                <dl>
                  <div>
                    <dt>Incluído</dt>
                    <dd>{revision.included.join(', ')}</dd>
                  </div>
                  <div>
                    <dt>Não incluído</dt>
                    <dd>
                      {revision.excluded.length > 0
                        ? revision.excluded.join(', ')
                        : 'Nenhuma exclusão declarada'}
                    </dd>
                  </div>
                  <div>
                    <dt>Preço do serviço</dt>
                    <dd>
                      Mão de obra {formatMoney(revision.breakdown.laborMinor)} · materiais{' '}
                      {formatMoney(revision.breakdown.materialsMinor)} · deslocamento{' '}
                      {formatMoney(revision.breakdown.travelMinor)}
                    </dd>
                  </div>
                  <div>
                    <dt>Taxa do cliente</dt>
                    <dd>{formatMoney(revision.breakdown.customerPlatformFeeMinor)}</dd>
                  </div>
                  <div>
                    <dt>Comissão da plataforma</dt>
                    <dd>
                      {formatMoney(revision.breakdown.professionalCommissionMinor)}, descontada do
                      profissional
                    </dd>
                  </div>
                  <div>
                    <dt>Líquido estimado do profissional</dt>
                    <dd>{formatMoney(revision.breakdown.professionalNetEstimateMinor)}</dd>
                  </div>
                  <div>
                    <dt>Agenda</dt>
                    <dd>
                      {formatDateTime(revision.schedule.startsAt, revision.schedule.timezone)} até{' '}
                      {formatDateTime(revision.schedule.endsAt, revision.schedule.timezone)} · fuso{' '}
                      {revision.schedule.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt>Validade</dt>
                    <dd>{formatDateTime(revision.validUntil, revision.schedule.timezone)}</dd>
                  </div>
                  <div>
                    <dt>Cancelamento</dt>
                    <dd>{revision.policies.cancellation.label}</dd>
                  </div>
                  <div>
                    <dt>Garantia voluntária</dt>
                    <dd>{revision.policies.guarantee?.text ?? 'Não oferecida nesta proposta.'}</dd>
                  </div>
                </dl>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
