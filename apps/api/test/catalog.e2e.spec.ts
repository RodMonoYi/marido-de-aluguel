import type {
  CategorySummary,
  ProfessionalCard,
  ProfessionalProfile,
  RestrictedIntent,
} from '@marido/contracts';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import {
  CatalogRepository,
  type SearchProfessionalsResult,
} from '../src/catalog/catalog.repository';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import { IntentRepository, type CreateIntentInput } from '../src/intents/intent.repository';

const service = {
  id: '019b0000-0000-7000-8000-000000000201',
  slug: 'visita-eletrica-residencial',
  name: 'Visita elétrica residencial',
  category: { slug: 'eletrica', name: 'Elétrica' },
  pricing: {
    model: 'FIXED' as const,
    from: { amountMinor: 12000, currency: 'BRL' as const },
    unitLabel: 'por visita',
  },
  modalities: ['AT_CLIENT' as const],
  durationMinutes: 60,
  summary: 'Diagnóstico inicial.',
};

const professional: ProfessionalCard = {
  id: '019b0000-0000-7000-8000-000000000101',
  slug: 'ana-reis-eletrica',
  displayName: 'Ana Reis',
  initials: 'AR',
  headline: 'Elétrica residencial',
  regionLabel: 'Salvador, BA',
  rating: { average: 4.9, count: 48 },
  completedServices: 71,
  responseTimeLabel: 'Costuma responder em até 1 hora',
  availabilityLabel: 'Próximos horários nesta semana',
  badges: [{ code: 'IDENTITY_CONFIRMED', label: 'Identidade confirmada' }],
  primaryService: service,
};

class CatalogRepositoryStub extends CatalogRepository {
  listCategories(): Promise<CategorySummary[]> {
    return Promise.resolve([
      {
        id: '019b0000-0000-7000-8000-000000000001',
        slug: 'eletrica',
        name: 'Elétrica',
        description: 'Serviços elétricos.',
        iconKey: 'bolt',
        availableProfessionals: 1,
      },
    ]);
  }

  searchProfessionals(): Promise<SearchProfessionalsResult> {
    return Promise.resolve({ items: [professional], total: 1 });
  }

  findProfessionalBySlug(slug: string): Promise<ProfessionalProfile | null> {
    if (slug !== professional.slug) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...professional,
      bio: 'Perfil de teste.',
      serviceAreas: ['Salvador'],
      services: [service],
      policies: { cancellation: '24 horas.', guarantee: null },
    });
  }
}

class IntentRepositoryStub extends IntentRepository {
  create(input: CreateIntentInput): Promise<RestrictedIntent> {
    return Promise.resolve({
      id: input.id,
      action: input.action,
      expiresAt: '2026-07-19T00:00:00.000Z',
    });
  }
}

describe('public catalog API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://unused';
    process.env.NODE_ENV = 'test';

    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CatalogRepository)
      .useClass(CatalogRepositoryStub)
      .overrideProvider(IntentRepository)
      .useClass(IntentRepositoryStub)
      .overrideProvider(DatabaseService)
      .useValue({ isReady: () => Promise.resolve(true), onApplicationShutdown: () => undefined })
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns an enveloped public search without protected contact data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/search/professionals?q=elétrica&city=Salvador')
      .expect(200);

    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ total: 1 });
    expect(JSON.stringify(response.body)).not.toMatch(/telefone|email|endereço/i);
  });

  it('returns a neutral 404 for an unavailable profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/professionals/perfil-inexistente')
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: 'PROFESSIONAL_NOT_FOUND',
      retryable: false,
    });
  });

  it('rejects extra fields when creating a restricted intent', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/intents')
      .send({
        professionalId: professional.id,
        serviceId: service.id,
        action: 'REQUEST_QUOTE',
        email: 'nao-deve-ser-coletado@example.test',
      })
      .expect(400);
  });
});
