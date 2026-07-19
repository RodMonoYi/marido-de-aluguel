import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const pages = {
  seguranca: {
    title: 'Segurança e confiança',
    description:
      'Não prometemos risco zero. Perfis, conteúdo e transações terão controles proporcionais, denúncia e revisão humana para decisões relevantes.',
  },
  suporte: {
    title: 'Suporte e denúncia',
    description:
      'O canal operacional será publicado com capacidade e SLA reais. Em emergência, procure os serviços públicos adequados da sua região.',
  },
  privacidade: {
    title: 'Privacidade',
    description:
      'A plataforma aplicará minimização, finalidade e acesso restrito. Endereço, contato, documento e localização exata não aparecem em páginas públicas.',
  },
  termos: {
    title: 'Termos de uso',
    description:
      'Os termos definitivos dependem de validação jurídica obrigatória. Este protótipo não cria contratação, pagamento ou relação comercial.',
  },
  cancelamento: {
    title: 'Cancelamento e reembolso',
    description:
      'As políticas serão mostradas antes de qualquer aceite e considerarão antecedência, execução, materiais, ausência, evidências e direitos legais.',
  },
  'como-funciona': {
    title: 'Como funciona',
    description:
      'Busque uma oferta publicada, compare o serviço e registre uma intenção. Contratação e pagamento somente serão habilitados após os gates obrigatórios.',
  },
} as const;

type InfoKey = keyof typeof pages;
type RouteParams = Promise<{ info: string }>;

function getPage(info: string) {
  return pages[info as InfoKey];
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { info } = await params;
  const page = getPage(info);
  return page ? { title: page.title, description: page.description } : {};
}

export default async function InformationPage({ params }: { params: RouteParams }) {
  const { info } = await params;
  const page = getPage(info);
  if (!page) {
    notFound();
  }

  return (
    <div className="shell standalone-state information-page">
      <p className="eyebrow">Informação essencial</p>
      <h1>{page.title}</h1>
      <p>{page.description}</p>
      <div className="neutral-notice">
        Esta página é um placeholder transparente do primeiro incremento. Os textos normativos
        finais serão publicados somente após os aceites indicados na especificação.
      </div>
      <Link className="button button-secondary" href="/">
        Voltar ao início
      </Link>
    </div>
  );
}
