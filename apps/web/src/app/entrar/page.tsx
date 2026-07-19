import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const intent = typeof raw.intent === 'string' ? raw.intent.slice(0, 80) : '';
  const hasSavedIntent = /^[0-9a-f-]{36}$/i.test(intent);

  return (
    <div className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Identidade protegida</p>
        <h1>
          {hasSavedIntent ? 'Sua intenção foi salva por 30 minutos.' : 'Acesso em preparação'}
        </h1>
        <p>
          A autenticação real será conectada a um provedor OIDC depois da homologação de sessão,
          MFA, recuperação e portabilidade. Nenhuma senha é coletada neste protótipo.
        </p>
        {hasSavedIntent ? (
          <div className="saved-intent" role="status">
            <strong>Solicitação ainda não enviada</strong>
            <span>
              O serviço, a disponibilidade e as permissões serão revalidados quando o login estiver
              habilitado.
            </span>
          </div>
        ) : null}
        <Link className="button button-secondary" href="/buscar">
          Continuar explorando
        </Link>
      </section>
      <aside className="auth-aside">
        <span aria-hidden="true">RP</span>
        <blockquote>Identidade real não deve nascer de um formulário improvisado.</blockquote>
        <p>Gate Q-19 da especificação</p>
      </aside>
    </div>
  );
}
