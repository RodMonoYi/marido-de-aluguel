import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApiErrorState } from '@/components/api-error-state';
import { DemoContextBar } from '@/components/demo-context-bar';
import { JourneySteps } from '@/components/journey-steps';
import { ProposalComparison } from '@/components/proposal-comparison';
import { ServiceRequestSummary } from '@/components/service-request-summary';
import type { DemoProposal, DemoServiceRequest } from '@/lib/demo-contract';
import { DemoApiError, demoApiRequest } from '@/lib/demo-api';
import { requireDemoActor } from '@/lib/demo-page';

export const metadata: Metadata = {
  title: 'Comparar propostas',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string }>;

const CLIENT_STEPS = [
  { label: 'Pedido', description: 'Publicado' },
  { label: 'Propostas', description: 'Comparação atual' },
  { label: 'Aceite', description: 'Snapshot imutável' },
  { label: 'Pagamento', description: 'Fora deste incremento' },
];

export default async function ProposalsPage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const actor = await requireDemoActor('CLIENT', `/pedidos/${id}/propostas`);
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
            description="Atualize a página. Nenhum aceite ou pagamento foi registrado."
            {...(error instanceof DemoApiError && error.correlationId
              ? { correlationId: error.correlationId }
              : {})}
            title="Não foi possível carregar as propostas."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="shell">
        <DemoContextBar actor={actor} />
        <JourneySteps current={2} steps={CLIENT_STEPS} />
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Comparação estruturada</p>
            <h1>Escolha pelo escopo completo, não só pelo preço.</h1>
          </div>
          <p>
            Cada card representa uma revisão imutável. O aceite registra exatamente a versão
            selecionada.
          </p>
        </header>
        <ServiceRequestSummary compact request={request} />
        {proposals.length > 0 ? (
          <ProposalComparison evaluatedAt={Date.now()} proposals={proposals} request={request} />
        ) : (
          <div className="empty-state empty-state-large">
            <p className="eyebrow">Sem propostas</p>
            <h2>Este pedido ainda não recebeu uma resposta.</h2>
            <p>Troque para o perfil profissional e envie a primeira versão.</p>
          </div>
        )}
      </div>
    </div>
  );
}
