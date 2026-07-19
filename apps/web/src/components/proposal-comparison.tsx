'use client';

import {
  DEMO_ACCEPTANCE_POLICY,
  DEMO_COMMERCIAL_POLICY,
  type AcceptProposalInput,
  type Proposal,
  type ProposalAcceptance,
  type ServiceRequest,
} from '@marido/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DemoClientError, demoMutation } from '@/lib/demo-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  clearIdempotencyKey,
  isDefinitiveCommandFailure,
  stableIdempotencyKey,
} from '@/lib/idempotent-command';
import { canAcceptProposal } from '@/lib/proposal-availability';

import { StatusChip } from './status-chip';

interface ProposalComparisonProps {
  proposals: Proposal[];
  request: ServiceRequest;
  evaluatedAt: number;
}

export function ProposalComparison({ proposals, request, evaluatedAt }: ProposalComparisonProps) {
  const router = useRouter();
  const [now, setNow] = useState(evaluatedAt);
  const selectable = proposals.filter((proposal) => canAcceptProposal(request, proposal, now));
  const [selectedId, setSelectedId] = useState(selectable[0]?.id ?? '');
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<'idle' | 'accepting'>('idle');
  const [error, setError] = useState<string>();
  const selected = selectable.find((proposal) => proposal.id === selectedId);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function accept(): Promise<void> {
    if (!selected || !acknowledged) {
      return;
    }
    setError(undefined);
    setState('accepting');

    const input: AcceptProposalInput = {
      revisionId: selected.currentRevision.id,
      acceptanceTextVersion: DEMO_ACCEPTANCE_POLICY.version,
    };
    const command = `POST /api/demo/proposals/${selected.id}/accept`;
    const commandPayload = {
      body: input,
      expectedVersion: selected.version,
    };
    try {
      const result = await demoMutation<ProposalAcceptance>(
        `proposals/${selected.id}/accept`,
        input,
        {
          idempotencyKey: await stableIdempotencyKey(command, commandPayload),
          ifMatch: `"${selected.version}"`,
        },
      );
      await clearIdempotencyKey(command, commandPayload).catch(() => undefined);
      router.push(`/contratos/${result.data.contract.id}`);
      router.refresh();
    } catch (caught) {
      if (isDefinitiveCommandFailure(caught)) {
        await clearIdempotencyKey(command, commandPayload).catch(() => undefined);
      }
      const clientError =
        caught instanceof DemoClientError
          ? caught
          : new DemoClientError(
              'Não foi possível aceitar a proposta.',
              500,
              'UNEXPECTED_ERROR',
              true,
            );
      const conflictMessage =
        clientError.code === 'PROPOSAL_VERSION_CONFLICT'
          ? ' A proposta mudou enquanto você comparava. Recarregue e revise a versão atual.'
          : clientError.code === 'SLOT_UNAVAILABLE'
            ? ' O período escolhido não está mais disponível.'
            : '';
      setError(
        `${clientError.message}${conflictMessage}${
          clientError.correlationId ? ` Referência: ${clientError.correlationId}.` : ''
        }`,
      );
      setState('idle');
    }
  }

  return (
    <div className="proposal-comparison">
      <fieldset className="proposal-choice-fieldset">
        <legend className="sr-only">Escolha a proposta que deseja aceitar</legend>
        <div className="proposal-compare-grid">
          {proposals.map((proposal) => {
            const revision = proposal.currentRevision;
            const canSelect = selectable.some((item) => item.id === proposal.id);
            return (
              <article
                className={`proposal-compare-card ${
                  selectedId === proposal.id ? 'proposal-compare-card-selected' : ''
                }`}
                key={proposal.id}
              >
                <div className="proposal-choice-heading">
                  <input
                    checked={selectedId === proposal.id}
                    disabled={!canSelect || state === 'accepting'}
                    id={`proposal-${proposal.id}`}
                    name="selectedProposal"
                    onChange={() => {
                      setSelectedId(proposal.id);
                      setAcknowledged(false);
                    }}
                    type="radio"
                    value={proposal.id}
                  />
                  <label htmlFor={`proposal-${proposal.id}`}>
                    <strong>{proposal.professional.displayName}</strong>
                    <small>Versão {revision.version}</small>
                  </label>
                  <StatusChip status={proposal.status} />
                </div>
                <div className="proposal-price">
                  <span>Total para o cliente</span>
                  <strong>{formatMoney(revision.breakdown.customerTotalMinor)}</strong>
                  <small>Todos os valores e descontos estão detalhados abaixo.</small>
                </div>
                <p className="proposal-scope">{revision.scope}</p>
                <dl className="proposal-comparison-facts">
                  <div>
                    <dt>Mão de obra</dt>
                    <dd>{formatMoney(revision.breakdown.laborMinor)}</dd>
                  </div>
                  <div>
                    <dt>Materiais</dt>
                    <dd>{formatMoney(revision.breakdown.materialsMinor)}</dd>
                  </div>
                  <div>
                    <dt>Deslocamento</dt>
                    <dd>{formatMoney(revision.breakdown.travelMinor)}</dd>
                  </div>
                  <div>
                    <dt>Taxa da plataforma para o cliente</dt>
                    <dd>{formatMoney(revision.breakdown.customerPlatformFeeMinor)}</dd>
                  </div>
                  <div>
                    <dt>
                      Comissão descontada do profissional (
                      {DEMO_COMMERCIAL_POLICY.professionalCommissionRateBps / 100}%)
                    </dt>
                    <dd>{formatMoney(revision.breakdown.professionalCommissionMinor)}</dd>
                  </div>
                  <div>
                    <dt>Líquido estimado do profissional</dt>
                    <dd>{formatMoney(revision.breakdown.professionalNetEstimateMinor)}</dd>
                  </div>
                  <div>
                    <dt>Início previsto</dt>
                    <dd>
                      {formatDateTime(revision.schedule.startsAt, revision.schedule.timezone)}
                    </dd>
                  </div>
                  <div>
                    <dt>Término previsto</dt>
                    <dd>{formatDateTime(revision.schedule.endsAt, revision.schedule.timezone)}</dd>
                  </div>
                  <div>
                    <dt>Fuso da agenda</dt>
                    <dd>{revision.schedule.timezone}</dd>
                  </div>
                  <div>
                    <dt>Válida até</dt>
                    <dd>{formatDateTime(revision.validUntil, revision.schedule.timezone)}</dd>
                  </div>
                  <div>
                    <dt>Inclui</dt>
                    <dd>{revision.included.join(', ')}</dd>
                  </div>
                  <div>
                    <dt>Não inclui</dt>
                    <dd>
                      {revision.excluded.length > 0
                        ? revision.excluded.join(', ')
                        : 'Nenhuma exclusão declarada'}
                    </dd>
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
              </article>
            );
          })}
        </div>
      </fieldset>

      <section className="acceptance-panel" aria-labelledby="acceptance-title">
        <div>
          <p className="eyebrow">Aceite explícito</p>
          <h2 id="acceptance-title">
            {selected
              ? `Aceitar proposta de ${selected.professional.displayName}`
              : 'Escolha uma proposta'}
          </h2>
          {selected ? (
            <p>
              Você aceitará a versão {selected.currentRevision.version}, no total de{' '}
              <strong>{formatMoney(selected.currentRevision.breakdown.customerTotalMinor)}</strong>.
              Escopo, preço, agenda e políticas serão preservados em um snapshot.
            </p>
          ) : (
            <p>Nenhuma proposta elegível está disponível para aceite.</p>
          )}
        </div>
        <div className="no-charge-notice">
          <strong>Nenhuma cobrança nesta etapa</strong>
          <span>
            Aceitar cria um contrato em <code>AWAITING_PAYMENT</code>. Não há checkout, cartão, Pix,
            pagamento aprovado ou booking confirmado neste incremento.
          </span>
        </div>
        <label className="acceptance-check">
          <input
            checked={acknowledged}
            disabled={!selected || state === 'accepting'}
            onChange={(event) => setAcknowledged(event.target.checked)}
            type="checkbox"
          />
          <span>{DEMO_ACCEPTANCE_POLICY.text}</span>
        </label>
        <p className="acceptance-policy-proof">
          Texto <code>{DEMO_ACCEPTANCE_POLICY.version}</code> · SHA-256{' '}
          <code>{DEMO_ACCEPTANCE_POLICY.textHash}</code>
        </p>
        {error ? (
          <p className="inline-error acceptance-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          aria-busy={state === 'accepting'}
          className="button button-primary"
          disabled={!selected || !acknowledged || state === 'accepting'}
          onClick={() => void accept()}
          type="button"
        >
          {state === 'accepting' ? 'Registrando aceite…' : 'Confirmar aceite sem pagar'}
        </button>
      </section>
    </div>
  );
}
