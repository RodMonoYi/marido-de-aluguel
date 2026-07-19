import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DEMO_ACTORS, getDemoActor, isDemoModeEnabled } from '@/lib/demo-session';

export const metadata: Metadata = {
  title: 'Escolher perfil de demonstração',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function safeReturnTo(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value.slice(0, 500)
    : '';
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isDemoModeEnabled()) {
    notFound();
  }

  const raw = await searchParams;
  const intent = first(raw.intent).slice(0, 80);
  const hasSavedIntent = /^[0-9a-f-]{36}$/i.test(intent);
  const requestedReturnTo = safeReturnTo(first(raw.returnTo));
  const required = first(raw.required);
  const currentActor = await getDemoActor();
  const clientReturnTo =
    requestedReturnTo ||
    (hasSavedIntent ? `/pedidos/novo?intent=${encodeURIComponent(intent)}` : '/pedidos/novo');
  const professionalReturnTo =
    requestedReturnTo && required !== 'CLIENT' ? requestedReturnTo : '/oportunidades';

  return (
    <div className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Jornada funcional com dados sintéticos</p>
        <h1>Escolha como deseja entrar.</h1>
        <p>
          Esta etapa não coleta senha nem representa autenticação real. O perfil escolhido apenas
          identifica suas ações no ambiente demonstrativo.
        </p>
        {hasSavedIntent ? (
          <div className="saved-intent" role="status">
            <strong>Sua intenção pública continua salva</strong>
            <span>
              Entre como cliente para transformar a intenção em um pedido. Nenhuma solicitação foi
              enviada ao profissional ainda.
            </span>
          </div>
        ) : null}
        {required === 'CLIENT' ? (
          <p className="role-requirement" role="status">
            Esta ação precisa do perfil cliente.
          </p>
        ) : null}
        {currentActor ? (
          <p className="current-demo-session">
            Perfil atual: <strong>{currentActor.displayName}</strong>
          </p>
        ) : null}
        <div className="role-choice-grid">
          <form action="/api/demo/session" method="post">
            <input name="role" type="hidden" value="CLIENT" />
            <input name="returnTo" type="hidden" value={clientReturnTo} />
            <div className="role-choice-card">
              <span className="role-monogram" aria-hidden="true">
                MS
              </span>
              <div>
                <span className="role-label">Cliente sintética</span>
                <h2>{DEMO_ACTORS.CLIENT.displayName}</h2>
                <p>Crie um pedido, compare propostas e aceite uma condição sem efetuar cobrança.</p>
              </div>
              <button className="button button-primary" type="submit">
                Entrar como cliente
              </button>
            </div>
          </form>
          <form action="/api/demo/session" method="post">
            <input name="role" type="hidden" value="PROFESSIONAL" />
            <input name="returnTo" type="hidden" value={professionalReturnTo} />
            <div className="role-choice-card role-choice-professional">
              <span className="role-monogram" aria-hidden="true">
                CO
              </span>
              <div>
                <span className="role-label">Profissional sintético</span>
                <h2>{DEMO_ACTORS.PROFESSIONAL.displayName}</h2>
                <p>Consulte oportunidades e envie uma proposta com revisão imutável.</p>
              </div>
              <button className="button button-secondary" type="submit">
                Entrar como profissional
              </button>
            </div>
          </form>
        </div>
        <Link className="auth-back-link" href="/buscar">
          Continuar sem entrar
        </Link>
      </section>
      <aside className="auth-aside">
        <span aria-hidden="true">RP</span>
        <blockquote>Dois lados do marketplace, uma jornada que deixa cada ação clara.</blockquote>
        <ul>
          <li>Nenhum dado pessoal real</li>
          <li>Nenhum cartão ou Pix solicitado</li>
          <li>Nenhuma cobrança nesta demonstração</li>
        </ul>
      </aside>
    </div>
  );
}
