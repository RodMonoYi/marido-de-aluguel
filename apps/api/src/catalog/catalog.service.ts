import { Injectable, NotFoundException } from '@nestjs/common';
import type { CategorySummary, ProfessionalProfile } from '@marido/contracts';

import {
  CatalogRepository,
  type SearchProfessionalsInput,
  type SearchProfessionalsResult,
} from './catalog.repository';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  listCategories(): Promise<CategorySummary[]> {
    return this.repository.listCategories();
  }

  searchProfessionals(input: SearchProfessionalsInput): Promise<SearchProfessionalsResult> {
    return this.repository.searchProfessionals(input);
  }

  async getProfessional(slug: string): Promise<ProfessionalProfile> {
    const professional = await this.repository.findProfessionalBySlug(slug);
    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_NOT_FOUND',
        message: 'Este perfil não está disponível.',
      });
    }
    return professional;
  }
}
