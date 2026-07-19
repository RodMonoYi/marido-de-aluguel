import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <div className="brand footer-brand">
            <span className="brand-mark" aria-hidden="true">
              RP
            </span>
            <span>Resolve Perto</span>
          </div>
          <p>
            Serviços locais com escopo, preço e histórico mais claros. A plataforma não substitui
            serviços de emergência.
          </p>
        </div>
        <nav aria-label="Confiança e suporte">
          <h2>Confiança</h2>
          <Link href="/seguranca">Segurança</Link>
          <Link href="/suporte">Suporte e denúncia</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
        <nav aria-label="Informações legais">
          <h2>Informações</h2>
          <Link href="/termos">Termos de uso</Link>
          <Link href="/cancelamento">Cancelamento</Link>
          <Link href="/como-funciona">Como funciona</Link>
        </nav>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 Resolve Perto</span>
        <span>Protótipo funcional com dados sintéticos</span>
      </div>
    </footer>
  );
}
