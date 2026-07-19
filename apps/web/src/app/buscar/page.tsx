import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorState } from '@/components/api-error-state';
import { ProfessionalCard } from '@/components/professional-card';
import { SearchForm } from '@/components/search-form';
import { ApiClientError, getCategories, searchProfessionals } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Buscar profissionais',
  robots: {
    index: false,
    follow: true,
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const q = first(raw.q).slice(0, 80);
  const city = first(raw.city).slice(0, 80);
  const category = first(raw.category).slice(0, 80);
  const cursor = first(raw.cursor).slice(0, 500);

  const categoriesPromise = getCategories().catch(() => []);
  let result: Awaited<ReturnType<typeof searchProfessionals>> | null = null;
  let error: ApiClientError | null = null;

  try {
    result = await searchProfessionals({
      ...(q ? { q } : {}),
      ...(city ? { city } : {}),
      ...(category ? { category } : {}),
      ...(cursor ? { cursor } : {}),
    });
  } catch (caught) {
    error = caught instanceof ApiClientError ? caught : new ApiClientError('Falha', 500);
  }

  const categories = await categoriesPromise;
  const titleParts = [q || categories.find((item) => item.slug === category)?.name, city].filter(
    Boolean,
  );
  const title =
    titleParts.length > 0
      ? `Profissionais para ${titleParts.join(' em ')}`
      : 'Profissionais e serviços disponíveis';

  const nextParameters = new URLSearchParams();
  if (q) nextParameters.set('q', q);
  if (city) nextParameters.set('city', city);
  if (category) nextParameters.set('category', category);
  if (result?.meta.next_cursor) nextParameters.set('cursor', result.meta.next_cursor);

  return (
    <div className="search-page">
      <section className="search-top">
        <div className="shell">
          <p className="breadcrumb">
            <Link href="/">Início</Link>
            <span aria-hidden="true">/</span>
            Busca
          </p>
          <SearchForm compact defaultCity={city} defaultQuery={q} />
        </div>
      </section>
      <div className="shell search-layout">
        <aside className="filter-panel" aria-labelledby="filter-title">
          <h2 id="filter-title">Refinar busca</h2>
          <form action="/buscar">
            <div className="field-group">
              <label htmlFor="filter-query">Serviço ou profissional</label>
              <input defaultValue={q} id="filter-query" name="q" type="search" />
            </div>
            <div className="field-group">
              <label htmlFor="filter-city">Cidade ou bairro</label>
              <input defaultValue={city} id="filter-city" name="city" type="text" />
            </div>
            <div className="field-group">
              <label htmlFor="filter-category">Categoria</label>
              <select defaultValue={category} id="filter-category" name="category">
                <option value="">Todas as categorias</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="button button-secondary" type="submit">
              Aplicar filtros
            </button>
            <Link className="clear-filters" href="/buscar">
              Limpar filtros
            </Link>
          </form>
        </aside>
        <section aria-labelledby="results-title" className="results-panel">
          <div className="results-heading" aria-live="polite">
            <div>
              <p className="eyebrow">Resultados orgânicos</p>
              <h1 id="results-title">{title}</h1>
            </div>
            {result ? (
              <span>
                {result.meta.total ?? result.data.length}{' '}
                {(result.meta.total ?? result.data.length) === 1 ? 'resultado' : 'resultados'}
              </span>
            ) : null}
          </div>

          {error ? (
            <ApiErrorState
              {...(error.correlationId ? { correlationId: error.correlationId } : {})}
            />
          ) : result && result.data.length > 0 ? (
            <>
              <div className="professional-list">
                {result.data.map((professional) => (
                  <ProfessionalCard key={professional.id} professional={professional} />
                ))}
              </div>
              {result.meta.next_cursor ? (
                <Link
                  className="button button-outline load-more"
                  href={`/buscar?${nextParameters}`}
                >
                  Ver mais resultados
                </Link>
              ) : (
                <p className="results-end">Você chegou ao fim dos resultados disponíveis.</p>
              )}
            </>
          ) : (
            <div className="empty-state empty-state-large">
              <p className="eyebrow">Nenhum resultado</p>
              <h2>Não encontramos uma oferta com esses filtros.</h2>
              <p>
                Tente remover um termo, buscar apenas pela cidade ou escolher outra categoria. Seus
                filtros não foram alterados automaticamente.
              </p>
              <Link className="button button-secondary" href="/buscar">
                Limpar filtros
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
