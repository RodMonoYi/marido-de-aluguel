import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorState } from '@/components/api-error-state';
import { DemoContextBar } from '@/components/demo-context-bar';
import { ServiceRequestSummary } from '@/components/service-request-summary';
import type { DemoServiceRequest } from '@/lib/demo-contract';
import { DemoApiError, demoApiRequest } from '@/lib/demo-api';
import { requireDemoActor } from '@/lib/demo-page';

export const metadata: Metadata = {
  title: 'Oportunidades demonstrativas',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const actor = await requireDemoActor('PROFESSIONAL', '/oportunidades');
  let opportunities: DemoServiceRequest[] = [];
  let error: DemoApiError | null = null;

  try {
    const result = await demoApiRequest<DemoServiceRequest[]>(
      '/service-requests?scope=opportunities',
      { actor },
    );
    opportunities = result.data;
  } catch (caught) {
    error =
      caught instanceof DemoApiError
        ? caught
        : new DemoApiError('Falha ao carregar oportunidades.', 500);
  }

  return (
    <div className="workspace-page">
      <div className="shell">
        <DemoContextBar actor={actor} />
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Oferta elegível · Salvador</p>
            <h1>Oportunidades com escopo antes da proposta.</h1>
          </div>
          <p>
            Você vê somente região aproximada e pedidos publicados na categoria atendida. Nenhum
            endereço completo é exposto.
          </p>
        </header>
        {error ? (
          <ApiErrorState
            description="Atualize a página. Nenhuma proposta foi criada por esta consulta."
            {...(error.correlationId ? { correlationId: error.correlationId } : {})}
            title="Não foi possível carregar oportunidades."
          />
        ) : opportunities.length > 0 ? (
          <div className="opportunity-list">
            {opportunities.map((request) => (
              <div className="opportunity-item" key={request.id}>
                <ServiceRequestSummary compact request={request} />
                <Link
                  aria-label={`Abrir oportunidade: ${request.title}`}
                  className="button button-primary"
                  href={`/oportunidades/${request.id}`}
                >
                  Ver e propor
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state empty-state-large">
            <p className="eyebrow">Fila vazia</p>
            <h2>Nenhum pedido elegível foi publicado.</h2>
            <p>
              Entre como cliente, publique um pedido de montagem de móveis e volte a este perfil.
            </p>
            <Link className="button button-secondary" href="/entrar?returnTo=/pedidos/novo">
              Entrar como cliente
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
