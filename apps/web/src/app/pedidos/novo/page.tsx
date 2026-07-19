import type { Metadata } from 'next';

import { DemoContextBar } from '@/components/demo-context-bar';
import { JourneySteps } from '@/components/journey-steps';
import { RequestForm } from '@/components/request-form';
import { getCategories } from '@/lib/api';
import { requireDemoActor } from '@/lib/demo-page';

export const metadata: Metadata = {
  title: 'Publicar pedido demonstrativo',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const CLIENT_STEPS = [
  { label: 'Pedido', description: 'Descreva a necessidade' },
  { label: 'Propostas', description: 'Compare versões' },
  { label: 'Aceite', description: 'Confirme o snapshot' },
  { label: 'Pagamento', description: 'Fora deste incremento' },
];

export default async function NewServiceRequestPage() {
  const actor = await requireDemoActor('CLIENT', '/pedidos/novo');
  const categories = await getCategories().catch(() => []);

  return (
    <div className="workspace-page">
      <div className="shell">
        <DemoContextBar actor={actor} />
        <JourneySteps current={1} steps={CLIENT_STEPS} />
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Novo pedido privado</p>
            <h1>Explique o serviço sem expor seu endereço.</h1>
          </div>
          <p>
            O pedido nasce como rascunho e é publicado em uma segunda operação auditável. Nenhuma
            cobrança ou contratação acontece aqui.
          </p>
        </header>
        {categories.length > 0 ? (
          <RequestForm categories={categories} />
        ) : (
          <div className="error-state" role="alert">
            <p className="eyebrow">Catálogo indisponível</p>
            <h2>Não é possível publicar sem uma categoria válida.</h2>
            <p>Atualize a página quando a API estiver disponível.</p>
          </div>
        )}
      </div>
    </div>
  );
}
