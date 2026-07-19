import type { Metadata, Viewport } from 'next';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5174'),
  title: {
    default: 'Resolve Perto | Serviços locais com tudo combinado',
    template: '%s | Resolve Perto',
  },
  description:
    'Encontre profissionais locais e compare escopo, prazo, preço e avaliações ligadas a serviços.',
  openGraph: {
    locale: 'pt_BR',
    type: 'website',
    siteName: 'Resolve Perto',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f3ea',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        <SiteHeader />
        <main id="conteudo">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
