import Link from 'next/link';

import { getDemoActor } from '@/lib/demo-session';

export async function SiteHeader() {
  const actor = await getDemoActor();

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Resolve Perto, página inicial">
          <span className="brand-mark" aria-hidden="true">
            RP
          </span>
          <span>Resolve Perto</span>
        </Link>
        <nav aria-label="Navegação principal" className="primary-nav">
          <Link href="/buscar">Buscar profissionais</Link>
          {actor ? (
            <>
              <Link href={actor.homePath}>
                {actor.role === 'CLIENT' ? 'Novo pedido' : 'Oportunidades'}
              </Link>
              <Link className="demo-actor-link" href="/entrar">
                <span className="demo-actor-initial" aria-hidden="true">
                  {actor.displayName.slice(0, 1)}
                </span>
                <span>
                  <small>Perfil demo</small>
                  {actor.shortName}
                </span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/entrar">Entrar</Link>
              <Link
                className="button button-compact button-outline"
                href="/entrar?returnTo=/pedidos/novo&required=CLIENT"
              >
                Publicar pedido
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
