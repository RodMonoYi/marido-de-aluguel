import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiErrorState } from '@/components/api-error-state';
import { DemoContextBar } from '@/components/demo-context-bar';
import { JourneySteps } from '@/components/journey-steps';
import { ProposalForm } from '@/components/proposal-form';
import { ProposalRevisionHistory } from '@/components/proposal-revision-history';
import { ServiceRequestSummary } from '@/components/service-request-summary';
import type { DemoProposal, DemoProposalRevision, DemoServiceRequest } from '@/lib/demo-contract';
import { DemoApiError, demoApiRequest } from '@/lib/demo-api';
import { requireDemoActor } from '@/lib/demo-page';
import { canReviseProposal, isRequestOpenForProposals } from '@/lib/proposal-availability';

export const metadata: Metadata = {
  title: 'Responder oportunidade',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string }>;

const PROFESSIONAL_STEPS = [
  { label: 'Oportunidade', description: 'Pedido elegível' },
  { label: 'Proposta', description: 'Escopo e preço' },
  { label: 'Revisão', description: 'Histórico imutável' },
];

export default async function OpportunityPage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const actor = await requireDemoActor('PROFESSIONAL', `/oportunidades/${id}`);
  let request: DemoServiceRequest;
  let proposals: DemoProposal[];
  let revisions: DemoProposalRevision[] = [];

  try {
    const [requestResult, proposalResult] = await Promise.all([
      demoApiRequest<DemoServiceRequest>(`/service-requests/${encodeURIComponent(id)}`, { actor }),
      demoApiRequest<DemoProposal[]>(`/service-requests/${encodeURIComponent(id)}/proposals`, {
        actor,
      }),
    ]);
    request = requestResult.data;
    proposals = proposalResult.data;
    if (proposals[0]) {
      const revisionResult = await demoApiRequest<DemoProposalRevision[]>(
        `/proposals/${encodeURIComponent(proposals[0].id)}/revisions`,
        { actor },
      ).catch(() => null);
      revisions = revisionResult?.data ?? [proposals[0].currentRevision];
    }
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="workspace-page">
        <div className="shell">
          <DemoContextBar actor={actor} />
          <ApiErrorState
            description="Atualize a página. Nenhuma proposta foi enviada ou revisada."
            {...(error instanceof DemoApiError && error.correlationId
              ? { correlationId: error.correlationId }
              : {})}
            title="Não foi possível carregar esta oportunidade."
          />
        </div>
      </div>
    );
  }

  const existingProposal = proposals[0];
  const requestOpen = isRequestOpenForProposals(request);
  const proposalEditable = existingProposal
    ? canReviseProposal(request, existingProposal)
    : requestOpen;
  const terminalMessage =
    request.status === 'CONVERTED'
      ? 'O cliente já aceitou uma proposta. O pedido e as demais propostas estão encerrados.'
      : request.status === 'CANCELLED'
        ? 'O cliente cancelou este pedido. Nenhuma nova proposta ou revisão é permitida.'
        : request.status === 'EXPIRED' || !requestOpen
          ? 'O prazo da oportunidade ou a janela de execução terminou. A versão existente permanece apenas para consulta.'
          : existingProposal
            ? `A proposta está em estado ${existingProposal.status} e não aceita novas revisões.`
            : 'Esta oportunidade não aceita novas propostas.';

  return (
    <div className="workspace-page">
      <div className="shell">
        <DemoContextBar actor={actor} />
        <JourneySteps current={existingProposal ? 3 : 2} steps={PROFESSIONAL_STEPS} />
        <header className="workspace-heading workspace-heading-compact">
          <div>
            <p className="eyebrow">Oportunidade elegível</p>
            <h1>
              {!proposalEditable
                ? 'Oportunidade encerrada para novos comandos.'
                : existingProposal
                  ? 'Revise sem apagar a versão anterior.'
                  : 'Monte uma proposta comparável.'}
            </h1>
          </div>
          <p>
            O cliente receberá composição de preço, agenda, inclusões, exclusões e políticas na
            mesma estrutura.
          </p>
        </header>
        <ServiceRequestSummary request={request} />
        {existingProposal ? (
          <>
            <div className="existing-proposal-banner">
              <div>
                <strong>
                  Proposta enviada · versão {existingProposal.currentRevision.version} ·{' '}
                  {existingProposal.status}
                </strong>
                <span>
                  {proposalEditable
                    ? 'Edite abaixo para criar uma revisão append-only. O conteúdo anterior continuará no histórico.'
                    : 'A proposta e suas revisões permanecem consultáveis, sem permitir novos comandos.'}
                </span>
              </div>
              <Link
                className="button button-outline"
                href={`/entrar?returnTo=${encodeURIComponent(`/pedidos/${request.id}/propostas`)}`}
              >
                Comparar como cliente
              </Link>
            </div>
            <ProposalRevisionHistory
              currentRevisionId={existingProposal.currentRevision.id}
              revisions={revisions}
            />
          </>
        ) : null}
        <section className="proposal-editor-section" aria-labelledby="proposal-editor-title">
          <div className="section-heading compact-section-heading">
            <div>
              <p className="eyebrow">{proposalEditable ? 'Sua resposta' : 'Estado terminal'}</p>
              <h2 id="proposal-editor-title">
                {proposalEditable
                  ? existingProposal
                    ? 'Nova revisão da proposta'
                    : 'Proposta personalizada'
                  : 'Nenhuma nova versão pode ser enviada'}
              </h2>
            </div>
          </div>
          {proposalEditable ? (
            <ProposalForm {...(existingProposal ? { existingProposal } : {})} request={request} />
          ) : (
            <div className="empty-state empty-state-large" role="status">
              <p>{terminalMessage}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
