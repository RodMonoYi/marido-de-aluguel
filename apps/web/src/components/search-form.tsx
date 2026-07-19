import { SearchIcon } from './icons';

interface SearchFormProps {
  defaultQuery?: string;
  defaultCity?: string;
  compact?: boolean;
}

export function SearchForm({
  defaultQuery = '',
  defaultCity = '',
  compact = false,
}: SearchFormProps) {
  return (
    <form action="/buscar" className={compact ? 'search-form search-form-compact' : 'search-form'}>
      <div className="search-field">
        <label htmlFor={compact ? 'search-query-compact' : 'search-query'}>
          Qual serviço você precisa?
        </label>
        <div className="input-with-icon">
          <SearchIcon />
          <input
            autoComplete="off"
            defaultValue={defaultQuery}
            id={compact ? 'search-query-compact' : 'search-query'}
            name="q"
            placeholder="Ex.: montagem de móveis"
            type="search"
          />
        </div>
      </div>
      <div className="search-field">
        <label htmlFor={compact ? 'search-city-compact' : 'search-city'}>Cidade ou bairro</label>
        <input
          autoComplete="address-level2"
          defaultValue={defaultCity}
          id={compact ? 'search-city-compact' : 'search-city'}
          name="city"
          placeholder="Ex.: Salvador"
          type="text"
        />
      </div>
      <button className="button button-primary search-submit" type="submit">
        Buscar profissionais
      </button>
    </form>
  );
}
