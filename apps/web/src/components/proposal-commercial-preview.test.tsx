import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProposalCommercialPreview } from './proposal-commercial-preview';

describe('ProposalCommercialPreview', () => {
  it('exposes customer total, zero customer fee, commission and professional net', () => {
    render(
      <ProposalCommercialPreview
        amounts={{
          laborMinor: 20_000,
          materialsMinor: 5_000,
          travelMinor: 1_000,
          currency: 'BRL',
        }}
      />,
    );

    expect(screen.getAllByText('R$ 260,00')).toHaveLength(2);
    expect(screen.getByText('Taxa da plataforma para o cliente')).toBeInTheDocument();
    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.getByText('Comissão descontada do profissional (15%)')).toBeInTheDocument();
    expect(screen.getByText('R$ 39,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 221,00')).toBeInTheDocument();
  });
});
