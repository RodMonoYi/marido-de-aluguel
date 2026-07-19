import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiErrorState } from '@/components/api-error-state';
import { DemoContextBar } from '@/components/demo-context-bar';
import { JourneySteps } from '@/components/journey-steps';
import { ServiceRequestSummary } from '@/components/service-request-summary';
import type { DemoProposal, DemoServiceRequest } from '@/lib/demo-contract';
import { DemoApiError, demoApiRequest } from '@/lib/demo-api';
import { requireDemoActor } from '@/lib/demo-page';

export const metadata: Metadata = {
  title: 'Pedido demonstrativo',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string }>;

const CLIENT_STEPS = [
  { label: 'Pedido', description: 'Publicado' },
  { label: 'Propostas', description: 'Aguardando respostas' },
  { label: 'Aceite', description: 'Snapshot imutável' },
  { label: 'Pagamento', description: 'Fora deste incremento' },
];

export default async function ServiceRequestPage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const actor = await requireDemoActor('CLIENT', `/pedidos/${id}`);
  let request: DemoServiceRequest;
  let proposals: DemoProposal[];

  try {
    const [requestResult, proposalResult] = await Promise.all([
      demoApiRequest<DemoServiceRequest>(`/service-requests/${encodeURIComponent(id)}`, { actor }),
      demoApiRequest<DemoProposal[]>(`/service-requests/${encodeURIComponent(id)}/proposals`, {
        actor,
      }),
    ]);
    request = requestResult.data;
    proposals = proposalResult.data;
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="workspace-page">
        <div className="shell">
          <DemoContextBar actor={actor} />
          <ApiErrorState
            description="Atualize a página. Nenhum novo pedido ou pagamento será criado por esta consulta."
            {...(error instanceof DemoApiError && error.correlationId
              ? { correlationId: error.correlationId }
              : {})}
            title="Não foi possível carregar o pedido."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="shell">
        <DemoContextBar actor={actor} />
        <JourneySteps current={proposals.length > 0 ? 2 : 1} steps={CLIENT_STEPS} />
        <header className="workspace-heading workspace-heading-compact">
          <div>
            <p className="eyebrow">Pedido {request.status.toLowerCase()}</p>
            <h1>Seu pedido está visível para oferta elegível.</h1>
          </div>
          <StatusBlock proposalCount={proposals.length} />
        </header>
        <ServiceRequestSummary request={request} />
        <div className="next-action-panel">
          {proposals.length > 0 ? (
            <>
              <div>
                <p className="eyebrow">Próxima ação</p>
                <h2>Compare as propostas recebidas.</h2>
                <p>
                  Preço, itens incluídos, agenda e políticas aparecem lado a lado antes do aceite.
                </p>
              </div>
              <Link className="button button-primary" href={`/pedidos/${request.id}/propostas`}>
                Comparar {proposals.length} {proposals.length === 1 ? 'proposta' : 'propostas'}
              </Link>
            </>
          ) : (
            <>
              <div>
                <p className="eyebrow">Demonstre o outro lado</p>
                <h2>Agora responda como profissional.</h2>
                <p>
                  Troque para Casa em Ordem, abra esta oportunidade e envie uma proposta versionada.
                </p>
              </div>
              <Link
                className="button button-secondary"
                href={`/entrar?returnTo=${encodeURIComponent(`/oportunidades/${request.id}`)}`}
              >
                Entrar como profissional
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBlock({ proposalCount }: { proposalCount: number }) {
  return (
    <div className="workspace-stat" aria-label="Propostas recebidas">
      <strong>{proposalCount}</strong>
      <span>{proposalCount === 1 ? 'proposta recebida' : 'propostas recebidas'}</span>
    </div>
  );
}
