import { webcrypto } from 'node:crypto';

import { DEMO_ACCEPTANCE_POLICY, type Proposal, type ServiceRequest } from '@marido/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoClientError } from '@/lib/demo-client';
import { ProposalComparison } from './proposal-comparison';

const { demoMutationMock, pushMock, refreshMock } = vi.hoisted(() => ({
  demoMutationMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/lib/demo-client', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/demo-client')),
  demoMutation: demoMutationMock,
}));

const proposal: Proposal = {
  id: '019b0000-0000-7000-8000-000000000601',
  requestId: '019b0000-0000-7000-8000-000000000501',
  professional: {
    id: '019b0000-0000-7000-8000-000000000102',
    slug: 'casa-em-ordem-montagens',
    displayName: 'Casa em Ordem',
  },
  status: 'SENT',
  version: 1,
  currentRevision: {
    id: '019b0000-0000-7000-8000-000000000602',
    version: 1,
    scope: 'Montagem completa com conferência das peças e ajuste final.',
    included: ['Montagem completa', 'Proteção do piso'],
    excluded: ['Fixação em parede'],
    breakdown: {
      laborMinor: 25000,
      materialsMinor: 0,
      travelMinor: 0,
      customerPlatformFeeMinor: 0,
      professionalCommissionMinor: 3750,
      customerTotalMinor: 25000,
      professionalNetEstimateMinor: 21250,
      currency: 'BRL',
      policy: { code: 'DEMO_COMMISSION_15_PERCENT', version: 1, developmentOnly: true },
    },
    schedule: {
      startsAt: '2026-07-25T12:00:00.000-03:00',
      endsAt: '2026-07-25T15:00:00.000-03:00',
      timezone: 'America/Bahia',
    },
    validUntil: '2026-07-23T18:00:00.000-03:00',
    policies: {
      cancellation: {
        code: 'DEMO_FLEXIBLE',
        version: 1,
        label: 'Reagendamento com 24 horas de antecedência.',
      },
      guarantee: {
        offeredBy: 'PROFESSIONAL',
        text: 'Garantia de 30 dias para ajustes da montagem.',
      },
    },
    createdAt: '2026-07-19T14:00:00.000-03:00',
  },
  createdAt: '2026-07-19T14:00:00.000-03:00',
  updatedAt: '2026-07-19T14:00:00.000-03:00',
};

const request: ServiceRequest = {
  id: proposal.requestId,
  title: 'Montagem de guarda-roupa',
  description: 'Montagem completa de guarda-roupa com seis portas.',
  category: {
    id: '019b0000-0000-7000-8000-000000000201',
    slug: 'montagem',
    name: 'Montagem de móveis',
  },
  locationApprox: {
    city: 'Salvador',
    state: 'BA',
    district: 'Pituba',
  },
  desiredWindow: {
    startsAt: '2026-07-25T12:00:00.000-03:00',
    endsAt: '2026-07-25T15:00:00.000-03:00',
    timezone: 'America/Bahia',
  },
  urgency: 'WITHIN_7_DAYS',
  budget: null,
  visibility: 'PRIVATE_MATCHED',
  status: 'PUBLISHED',
  version: 2,
  proposalDeadline: '2026-07-23T18:00:00.000-03:00',
  proposalCount: 1,
  createdAt: '2026-07-19T13:00:00.000-03:00',
  publishedAt: '2026-07-19T13:05:00.000-03:00',
};

const evaluatedAt = Date.parse('2026-07-19T12:00:00.000-03:00');

describe('ProposalComparison', () => {
  const randomUUID = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    demoMutationMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
    randomUUID.mockReset();
    randomUUID.mockReturnValue('019b0000-0000-7000-8000-000000000921');
    vi.stubGlobal('crypto', {
      randomUUID,
      subtle: webcrypto.subtle,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires explicit acknowledgement before accepting without payment', () => {
    render(
      <ProposalComparison evaluatedAt={evaluatedAt} proposals={[proposal]} request={request} />,
    );

    const action = screen.getByRole('button', { name: 'Confirmar aceite sem pagar' });
    expect(action).toBeDisabled();
    expect(screen.getByText('Nenhuma cobrança nesta etapa')).toBeInTheDocument();
    expect(screen.getByText('Taxa da plataforma para o cliente')).toBeInTheDocument();
    expect(screen.getByText('Comissão descontada do profissional (15%)')).toBeInTheDocument();
    expect(screen.getByText('Líquido estimado do profissional')).toBeInTheDocument();
    expect(screen.getByText('Término previsto')).toBeInTheDocument();
    expect(screen.getByText('America/Bahia')).toBeInTheDocument();
    expect(
      screen.getByText(proposal.currentRevision.policies.cancellation.label),
    ).toBeInTheDocument();
    expect(screen.getByText(DEMO_ACCEPTANCE_POLICY.text)).toBeInTheDocument();
    expect(screen.getByText(DEMO_ACCEPTANCE_POLICY.textHash)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /declaro que li e aceito o escopo/i,
      }),
    );

    expect(action).toBeEnabled();
  });

  it('reuses the acceptance key after an ambiguous client failure', async () => {
    demoMutationMock
      .mockRejectedValueOnce(new DemoClientError('Falha de rede', 0, 'NETWORK_ERROR', true))
      .mockResolvedValueOnce({
        data: {
          contract: { id: '019b0000-0000-7000-8000-000000000922' },
        },
      });
    render(
      <ProposalComparison evaluatedAt={evaluatedAt} proposals={[proposal]} request={request} />,
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /declaro que li e aceito o escopo/i,
      }),
    );
    const action = screen.getByRole('button', { name: 'Confirmar aceite sem pagar' });

    fireEvent.click(action);
    await screen.findByText(/Falha de rede/);
    fireEvent.click(action);

    await waitFor(() => expect(demoMutationMock).toHaveBeenCalledTimes(2));
    expect(demoMutationMock.mock.calls[0]?.[2]?.idempotencyKey).toBe(
      demoMutationMock.mock.calls[1]?.[2]?.idempotencyKey,
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/contratos/019b0000-0000-7000-8000-000000000922');
    expect(sessionStorage).toHaveLength(0);
  });

  it('blocks acceptance when the request is effectively expired', () => {
    render(
      <ProposalComparison
        evaluatedAt={evaluatedAt}
        proposals={[proposal]}
        request={{ ...request, status: 'EXPIRED' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirmar aceite sem pagar' })).toBeDisabled();
    expect(
      screen.getByText('Nenhuma proposta elegível está disponível para aceite.'),
    ).toBeInTheDocument();
  });
});
