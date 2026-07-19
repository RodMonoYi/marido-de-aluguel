import Link from 'next/link';

import { ApiErrorState } from '@/components/api-error-state';
import { ArrowIcon, QuoteIcon, ShieldIcon, SparkIcon } from '@/components/icons';
import { ProfessionalCard } from '@/components/professional-card';
import { SearchForm } from '@/components/search-form';
import { getCategories, searchProfessionals } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [categoriesResult, professionalsResult] = await Promise.allSettled([
    getCategories(),
    searchProfessionals({ city: 'Salvador', limit: 3 }),
  ]);
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
  const professionals =
    professionalsResult.status === 'fulfilled' ? professionalsResult.value.data : [];
  const catalogUnavailable =
    categoriesResult.status === 'rejected' || professionalsResult.status === 'rejected';

  return (
    <>
      <section className="hero">
        <div className="hero-pattern" aria-hidden="true" />
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Serviços locais, com tudo combinado por escrito.</p>
            <h1>
              Encontre quem resolve, <em>perto de você.</em>
            </h1>
            <p className="hero-support">
              Compare escopo, prazo e avaliações ligadas a serviços. Ao contratar, o pagamento
              poderá ser processado por um provedor autorizado.
            </p>
            <SearchForm />
            <p className="location-note">
              Você não precisa compartilhar a localização exata. Cidade ou bairro já bastam para
              começar.
            </p>
          </div>
          <aside className="hero-proof" aria-label="Como a plataforma ajuda">
            <p className="proof-number">01</p>
            <QuoteIcon />
            <blockquote>
              O combinado não fica solto em mensagens: escopo, preço e prazo formam um histórico.
            </blockquote>
            <div className="proof-rule" />
            <span>Mais clareza antes de contratar</span>
          </aside>
        </div>
      </section>

      <section className="section shell" aria-labelledby="categorias-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Comece pelo que precisa</p>
            <h2 id="categorias-title">Serviços para colocar a casa em ordem</h2>
          </div>
          <Link className="text-link" href="/buscar">
            Ver todos
            <ArrowIcon />
          </Link>
        </div>
        {categories.length > 0 ? (
          <div className="category-grid">
            {categories.map((category, index) => (
              <Link
                className="category-card"
                href={`/buscar?category=${encodeURIComponent(category.slug)}`}
                key={category.id}
              >
                <span className="category-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="category-name">{category.name}</span>
                <span className="category-description">{category.description}</span>
                <span className="category-count">
                  {category.availableProfessionals}{' '}
                  {category.availableProfessionals === 1
                    ? 'perfil disponível'
                    : 'perfis disponíveis'}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <ApiErrorState title="As categorias não puderam ser carregadas." />
        )}
      </section>

      <section className="section section-tinted">
        <div className="shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Oferta local em destaque</p>
              <h2>Profissionais com serviço explicado</h2>
            </div>
            <span className="editorial-note">Resultados orgânicos, sem patrocínio no MVP</span>
          </div>
          {professionals.length > 0 ? (
            <div className="professional-list">
              {professionals.map((professional) => (
                <ProfessionalCard key={professional.id} professional={professional} />
              ))}
            </div>
          ) : catalogUnavailable ? (
            <ApiErrorState title="Os perfis estão temporariamente indisponíveis." />
          ) : (
            <div className="empty-state">
              <h3>A oferta piloto ainda está sendo preparada.</h3>
              <p>Use a busca para consultar outra cidade ou categoria.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section shell" aria-labelledby="como-funciona-title">
        <div className="split-heading">
          <div>
            <p className="eyebrow">Um caminho curto e rastreável</p>
            <h2 id="como-funciona-title">Da necessidade ao serviço combinado</h2>
          </div>
          <p>
            A plataforma organiza a decisão sem prometer risco zero, qualidade garantida ou
            resultado universal.
          </p>
        </div>
        <ol className="steps-grid">
          <li>
            <span>01</span>
            <SparkIcon />
            <h3>Encontre</h3>
            <p>Busque por serviço e região sem informar seu endereço completo.</p>
          </li>
          <li>
            <span>02</span>
            <QuoteIcon />
            <h3>Combine</h3>
            <p>Compare escopo, preço, prazo e condições antes de aceitar.</p>
          </li>
          <li>
            <span>03</span>
            <ShieldIcon />
            <h3>Contrate</h3>
            <p>Quando habilitado, pague pela plataforma e mantenha o histórico da contratação.</p>
          </li>
        </ol>
      </section>

      <section className="trust-section">
        <div className="shell trust-grid">
          <div>
            <p className="eyebrow eyebrow-light">Clareza em vez de promessas absolutas</p>
            <h2>Informação para decidir melhor</h2>
          </div>
          <ul>
            <li>Verificações mostradas com nome e escopo específicos.</li>
            <li>Endereço, telefone, e-mail e documentos não aparecem publicamente.</li>
            <li>Suporte e mediação seguem políticas e limites informados.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
