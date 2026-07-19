import { describe, expect, it } from 'vitest';

import { professionalCardSchema } from './index';

describe('professionalCardSchema', () => {
  it('rejects a zero rating because absence is represented by null', () => {
    const result = professionalCardSchema.safeParse({
      id: '019b0000-0000-7000-8000-000000000001',
      slug: 'oficina-teste',
      displayName: 'Oficina Teste',
      initials: 'OT',
      headline: 'Serviço sintético',
      regionLabel: 'Salvador, BA',
      rating: { average: 0, count: 0 },
      completedServices: 0,
      responseTimeLabel: 'Responde em até 2 horas',
      availabilityLabel: 'Consulte disponibilidade',
      badges: [],
      primaryService: {
        id: '019b0000-0000-7000-8000-000000000002',
        slug: 'servico-teste',
        name: 'Serviço teste',
        category: { slug: 'teste', name: 'Teste' },
        pricing: {
          model: 'CUSTOM_QUOTE',
          from: null,
          unitLabel: 'por orçamento',
        },
        modalities: ['AT_CLIENT'],
        durationMinutes: null,
        summary: 'Resumo sintético',
      },
    });

    expect(result.success).toBe(false);
  });
});
