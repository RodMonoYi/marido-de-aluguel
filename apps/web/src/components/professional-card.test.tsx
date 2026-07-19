import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProfessionalCard } from './professional-card';

const baseProfessional = {
  id: '019b0000-0000-7000-8000-000000000105',
  slug: 'brisa-limpeza',
  displayName: 'Brisa Limpeza',
  initials: 'BL',
  headline: 'Limpeza residencial com checklist combinado',
  regionLabel: 'Salvador, BA',
  rating: { average: null, count: 0 },
  completedServices: 0,
  responseTimeLabel: 'Costuma responder em até 3 horas',
  availabilityLabel: 'Novos horários nesta semana',
  badges: [],
  primaryService: {
    id: '019b0000-0000-7000-8000-000000000205',
    slug: 'limpeza-residencial',
    name: 'Limpeza residencial',
    category: { slug: 'limpeza', name: 'Limpeza' },
    pricing: {
      model: 'STARTING_AT' as const,
      from: { amountMinor: 15000, currency: 'BRL' as const },
      unitLabel: 'por diária',
    },
    modalities: ['AT_CLIENT' as const],
    durationMinutes: 240,
    summary: 'Checklist de ambientes e tarefas.',
  },
};

describe('ProfessionalCard', () => {
  it('shows absence of reviews without rendering a zero rating', () => {
    render(<ProfessionalCard professional={baseProfessional} />);

    expect(screen.getByText('Sem avaliações ainda')).toBeInTheDocument();
    expect(screen.queryByText('0,0')).not.toBeInTheDocument();
  });

  it('provides a specific accessible name for the profile action', () => {
    render(<ProfessionalCard professional={baseProfessional} />);

    expect(screen.getByRole('link', { name: 'Ver perfil de Brisa Limpeza' })).toHaveAttribute(
      'href',
      '/profissionais/brisa-limpeza',
    );
  });
});
