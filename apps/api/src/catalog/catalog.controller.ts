import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { apiPayload, type ApiPayload } from '../common/http/api-payload';
import { CatalogService } from './catalog.service';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';

@ApiTags('public catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Lista categorias públicas habilitadas' })
  listCategories(): ReturnType<CatalogService['listCategories']> {
    return this.catalog.listCategories();
  }

  @Get('search/professionals')
  @ApiOperation({ summary: 'Busca profissionais publicados sem expor localização exata' })
  async searchProfessionals(
    @Query() query: SearchProfessionalsDto,
  ): Promise<ApiPayload<Awaited<ReturnType<CatalogService['searchProfessionals']>>['items']>> {
    const result = await this.catalog.searchProfessionals({
      limit: query.limit ?? 12,
      ...(query.q ? { q: query.q } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return apiPayload(result.items, {
      total: result.total,
      ...(result.nextCursor ? { next_cursor: result.nextCursor } : {}),
    });
  }

  @Get('professionals/:slug')
  @ApiOperation({ summary: 'Obtém o perfil público de um profissional publicado' })
  @ApiParam({ name: 'slug', example: 'ana-reis-eletrica' })
  getProfessional(@Param('slug') slug: string): ReturnType<CatalogService['getProfessional']> {
    return this.catalog.getProfessional(slug);
  }
}
