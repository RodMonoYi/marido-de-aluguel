import type { CategorySummary, ProfessionalCard, ProfessionalProfile } from '@marido/contracts';

export interface SearchProfessionalsInput {
  q?: string;
  category?: string;
  city?: string;
  cursor?: string;
  limit: number;
}

export interface SearchProfessionalsResult {
  items: ProfessionalCard[];
  total: number;
  nextCursor?: string;
}

export abstract class CatalogRepository {
  abstract listCategories(): Promise<CategorySummary[]>;
  abstract searchProfessionals(input: SearchProfessionalsInput): Promise<SearchProfessionalsResult>;
  abstract findProfessionalBySlug(slug: string): Promise<ProfessionalProfile | null>;
}
