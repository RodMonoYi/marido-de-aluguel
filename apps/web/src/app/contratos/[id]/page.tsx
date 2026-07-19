import type { Metadata } from 'next';
import type { ProposalAcceptance } from '@marido/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiErrorState } from '@/components/api-error-state';
import { ContractPaymentNotice } from '@/components/contract-payment-notice';
import { DemoContextBar } from '@/components/demo-context-bar';
import { JourneySteps } from '@/components/journey-steps';
import { StatusChip } from '@/components/status-chip';
import { DemoApiError, demoApiRequest } from '@/lib/demo-api';
import { requireAnyDemoActor } from '@/lib/demo-page';
import { formatDateTime, formatMoney } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Contrato aguardando pagamento',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string }>;

const CLIENT_STEPS = [
  { label: 'Pedido', description: 'Publicado' },
  { label: 'Propostas', description: 'Versão comparada' },
  { label: 'Aceite', description: 'Contrato criado' },
  { label: 'Pagamento', description: 'Ainda não realizado' },
];

export default async function ContractPage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const actor = await requireAnyDemoActor(`/contratos/${id}`);
  let acceptance: ProposalAcceptance;

  try {
    const result = await demoApiRequest<ProposalAcceptance>(
      `/contracts/${encodeURIComponent(id)}`,
      { actor },
    );
    acceptance = result.data;
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="workspace-page">
        <div className="shell">
          <DemoContextBar actor={actor} />
          <ApiErrorState
            description="Atualize a página. Esta consulta não cria cobrança nem altera o contrato."
            {...(error instanceof DemoApiError && error.correlationId
              ? { correlationId: error.correlationId }
              : {})}
            title="Não foi possível carregar o contrato."
          />
        </div>
      </div>
    );
  }

  const { contract, paymentOrder, bookingHold } = acceptance;
  const { request, proposal } = contract.snapshot;
  const revision = proposal.revision;
  const awaitingPayment = contract.status === 'AWAITING_PAYMENT';
  const journeySteps = awaitingPayment
    ? CLIENT_STEPS
    : [
        { label: 'Pedido', description: 'Publicado' },
        { label: 'Propostas', description: 'Versão comparada' },
        { label: 'Aceite', description: 'Contrato criado' },
        { label: 'Pagamento', description: 'Expirou sem cobrança' },
      ];

  return (
    <div className="workspace-page contract-page">
      <div className="shell">
        <DemoContextBar actor={actor} />
        <JourneySteps current={awaitingPayment ? 3 : 4} steps={journeySteps} />
        <header className="workspace-heading contract-heading">
          <div>
            <p className="eyebrow">Aceite registrado · snapshot imutável</p>
            <h1>
              {awaitingPayment
                ? 'Contrato criado. Pagamento ainda pendente.'
                : 'Contrato encerrado sem pagamento.'}
            </h1>
          </div>
          <StatusChip status={contract.status} />
        </header>

        <ContractPaymentNotice
          bookingHold={bookingHold}
          contractId={contract.id}
          contractStatus={contract.status}
          paymentOrder={paymentOrder}
        />

        <div className="contract-layout">
          <article className="contract-snapshot" aria-labelledby="snapshot-title">
            <div className="contract-section-heading">
              <div>
                <p className="eyebrow">Condições aceitas</p>
                <h2 id="snapshot-title">{request.title}</h2>
              </div>
              <span>Revisão {revision.version}</span>
            </div>
            <p className="contract-scope">{revision.scope}</p>

            <div className="contract-inclusion-grid">
              <section aria-labelledby="included-title">
                <h3 id="included-title">Incluído</h3>
                <ul>
                  {revision.included.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="excluded-title">
                <h3 id="excluded-title">Não incluído</h3>
                {revision.excluded.length > 0 ? (
                  <ul>
                    {revision.excluded.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhuma exclusão declarada.</p>
                )}
              </section>
            </div>

            <dl className="contract-price-breakdown">
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
                <dt>Taxa do cliente</dt>
                <dd>{formatMoney(revision.breakdown.customerPlatformFeeMinor)}</dd>
              </div>
              <div>
                <dt>Comissão descontada do profissional</dt>
                <dd>{formatMoney(revision.breakdown.professionalCommissionMinor)}</dd>
              </div>
              <div>
                <dt>Líquido estimado do profissional</dt>
                <dd>{formatMoney(revision.breakdown.professionalNetEstimateMinor)}</dd>
              </div>
              <div className="contract-total-line">
                <dt>{awaitingPayment ? 'Total aguardando pagamento' : 'Valor não cobrado'}</dt>
                <dd>{formatMoney(revision.breakdown.customerTotalMinor)}</dd>
              </div>
            </dl>

            <div className="contract-policy-grid">
              <section>
                <h3>Agenda aceita</h3>
                <p>
                  {formatDateTime(revision.schedule.startsAt, revision.schedule.timezone)} até{' '}
                  {formatDateTime(revision.schedule.endsAt, revision.schedule.timezone)} · fuso{' '}
                  {revision.schedule.timezone}
                </p>
              </section>
              <section>
                <h3>Cancelamento e reagendamento</h3>
                <p>{revision.policies.cancellation.label}</p>
              </section>
              <section>
                <h3>Garantia voluntária</h3>
                <p>{revision.policies.guarantee?.text ?? 'Não oferecida nesta proposta.'}</p>
              </section>
            </div>

            <section className="contract-acceptance-evidence" aria-labelledby="acceptance-evidence">
              <p className="eyebrow">Evidência do consentimento</p>
              <h3 id="acceptance-evidence">
                Texto aceito · {contract.snapshot.acceptance.textVersion}
              </h3>
              <blockquote>{contract.snapshot.acceptance.text}</blockquote>
              <small>
                SHA-256 <code>{contract.snapshot.acceptance.textHash}</code>
              </small>
            </section>
          </article>

          <aside className="contract-timeline" aria-labelledby="timeline-title">
            <p className="eyebrow">Linha do tempo</p>
            <h2 id="timeline-title">O que aconteceu</h2>
            <ol>
              <li className="timeline-complete">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Proposta aceita</strong>
                  <small>{formatDateTime(contract.acceptedAt)}</small>
                </div>
              </li>
              <li className="timeline-complete">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Contrato criado</strong>
                  <small>Snapshot {contract.snapshotHash.slice(0, 12)}…</small>
                </div>
              </li>
              {awaitingPayment ? (
                <>
                  <li className="timeline-current">
                    <span aria-hidden="true">3</span>
                    <div>
                      <strong>Aguardando pagamento</strong>
                      <small>Checkout não disponível</small>
                    </div>
                  </li>
                  <li className="timeline-future">
                    <span aria-hidden="true">4</span>
                    <div>
                      <strong>Confirmação</strong>
                      <small>Não ocorreu</small>
                    </div>
                  </li>
                </>
              ) : (
                <>
                  <li className="timeline-complete">
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>Pagamento não realizado</strong>
                      <small>
                        Ordem {paymentOrder.status === 'EXPIRED' ? 'expirada' : 'cancelada'}
                      </small>
                    </div>
                  </li>
                  <li className="timeline-complete">
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>Contrato cancelado</strong>
                      <small>
                        {bookingHold.status === 'HOLD_EXPIRED' ? 'Hold expirado' : 'Hold liberado'}
                      </small>
                    </div>
                  </li>
                </>
              )}
            </ol>
            <Link className="button button-outline" href={actor.homePath}>
              Voltar ao início da jornada
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
