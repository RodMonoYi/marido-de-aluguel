import Link from 'next/link';

export function SiteHeader() {
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
          <Link href="/entrar">Entrar</Link>
          <Link
            className="button button-compact button-outline"
            href="/entrar?intent=publish-request"
          >
            Publicar pedido
          </Link>
        </nav>
      </div>
    </header>
  );
}
