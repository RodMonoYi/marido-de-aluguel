import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  acceptProposalInputSchema,
  calculateDemoProposalBreakdown,
  createServiceRequestInputSchema,
  DEMO_ACCEPTANCE_POLICY,
  DEMO_CANCELLATION_POLICY,
  DEMO_COMMERCIAL_POLICY,
  professionalCardSchema,
  proposalAcceptanceSchema,
} from './index';

function validProposalAcceptance() {
  const acceptedAt = '2026-07-19T12:00:00.000Z';
  const schedule = {
    startsAt: '2026-08-20T13:00:00.000Z',
    endsAt: '2026-08-20T15:00:00.000Z',
    timezone: 'America/Bahia',
  };
  const revision = {
    id: '019b0000-0000-7000-8000-000000000701',
    version: 1,
    scope: 'Montagem e ajuste do móvel descrito no pedido.',
    included: ['Montagem da estrutura'],
    excluded: ['Transporte do móvel'],
    breakdown: {
      laborMinor: 24_000,
      materialsMinor: 2_000,
      travelMinor: 0,
      customerPlatformFeeMinor: 0,
      professionalCommissionMinor: 3_900,
      customerTotalMinor: 26_000,
      professionalNetEstimateMinor: 22_100,
      currency: 'BRL',
      policy: {
        code: 'DEMO_COMMISSION_15_PERCENT',
        version: 1,
        developmentOnly: true,
      },
    },
    schedule,
    validUntil: '2026-08-19T21:00:00.000Z',
    policies: {
      cancellation: {
        code: DEMO_CANCELLATION_POLICY.code,
        version: DEMO_CANCELLATION_POLICY.version,
        label: DEMO_CANCELLATION_POLICY.label,
      },
      guarantee: {
        offeredBy: 'PROFESSIONAL',
        text: 'Garantia voluntária do profissional por 30 dias.',
      },
    },
    createdAt: acceptedAt,
  };
  const contractId = '019b0000-0000-7000-8000-000000000801';

  return {
    contract: {
      id: contractId,
      requestId: '019b0000-0000-7000-8000-000000000601',
      proposalId: '019b0000-0000-7000-8000-000000000702',
      acceptedRevisionId: revision.id,
      status: 'AWAITING_PAYMENT',
      version: 1,
      snapshotHash: 'a'.repeat(64),
      acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
      acceptedAt,
      snapshot: {
        request: {
          id: '019b0000-0000-7000-8000-000000000601',
          version: 2,
          title: 'Montagem de guarda-roupa',
          description: 'Móvel novo, desmontado e acompanhado de manual.',
          category: {
            id: '019b0000-0000-7000-8000-000000000004',
            slug: 'montagem',
            name: 'Montagem',
          },
          locationApprox: { city: 'Salvador', state: 'BA', district: 'Pituba' },
          desiredWindow: {
            startsAt: '2026-08-20T12:00:00.000Z',
            endsAt: '2026-08-20T18:00:00.000Z',
            timezone: 'America/Bahia',
          },
          urgency: 'FLEXIBLE',
          budget: { minMinor: 18_000, maxMinor: 35_000, currency: 'BRL' },
        },
        parties: {
          customerActorId: '019b0000-0000-7000-8000-000000000401',
          professionalActorId: '019b0000-0000-7000-8000-000000000402',
          professionalProfileId: '019b0000-0000-7000-8000-000000000102',
        },
        proposal: {
          id: '019b0000-0000-7000-8000-000000000702',
          version: 1,
          revision,
        },
        acceptance: {
          textVersion: DEMO_ACCEPTANCE_POLICY.version,
          text: DEMO_ACCEPTANCE_POLICY.text,
          textHash: DEMO_ACCEPTANCE_POLICY.textHash,
          acceptedAt,
        },
      },
    },
    paymentOrder: {
      id: '019b0000-0000-7000-8000-000000000802',
      contractId,
      status: 'AWAITING_PAYMENT',
      amount: { amountMinor: 26_000, currency: 'BRL' },
      checkoutAvailable: false,
      createdAt: acceptedAt,
    },
    bookingHold: {
      id: '019b0000-0000-7000-8000-000000000803',
      contractId,
      status: 'HOLD_ACTIVE',
      schedule,
      expiresAt: '2026-07-19T12:10:00.000Z',
      createdAt: acceptedAt,
    },
  };
}

describe('demo marketplace policies', () => {
  it('locks the development-only commercial policy and derives its complete breakdown', () => {
    expect(DEMO_COMMERCIAL_POLICY).toMatchObject({
      professionalCommissionRateBps: 1_500,
      customerPlatformFeeMinor: 0,
      developmentOnly: true,
    });

    expect(
      calculateDemoProposalBreakdown({
        laborMinor: 24_000,
        materialsMinor: 2_000,
        travelMinor: 0,
        currency: 'BRL',
      }),
    ).toEqual({
      laborMinor: 24_000,
      materialsMinor: 2_000,
      travelMinor: 0,
      customerPlatformFeeMinor: 0,
      professionalCommissionMinor: 3_900,
      customerTotalMinor: 26_000,
      professionalNetEstimateMinor: 22_100,
      currency: 'BRL',
      policy: {
        code: 'DEMO_COMMISSION_15_PERCENT',
        version: 1,
        developmentOnly: true,
      },
    });
  });

  it('rejects an aggregate amount outside the JavaScript safe integer range', () => {
    expect(() =>
      calculateDemoProposalBreakdown({
        laborMinor: Number.MAX_SAFE_INTEGER,
        materialsMinor: 1,
        travelMinor: 0,
        currency: 'BRL',
      }),
    ).toThrow(RangeError);
  });

  it('pins the exact PT-BR acceptance text to its fixed SHA-256 digest', () => {
    const calculatedHash = createHash('sha256')
      .update(DEMO_ACCEPTANCE_POLICY.text, 'utf8')
      .digest('hex');

    expect(DEMO_ACCEPTANCE_POLICY.version).toBe('DEMO-CONTRACT-PTBR-1');
    expect(calculatedHash).toBe(DEMO_ACCEPTANCE_POLICY.textHash);
    expect(DEMO_ACCEPTANCE_POLICY.textHash).toBe(
      '4b248e93828ef5204ffc74e98d3b5ea87dcd1f9a2175f87f4406430de5f2b3c3',
    );
  });

  it('locks the no-charge demonstration cancellation policy', () => {
    expect(DEMO_CANCELLATION_POLICY).toEqual({
      code: 'DEMO_CANCELLATION_NO_CHARGE',
      version: 1,
      label: 'Demonstração sem cobrança: cancelamentos não geram taxa.',
    });
  });
});

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

describe('createServiceRequestInputSchema', () => {
  it('rejects an inverted budget and a deadline after the desired start', () => {
    const result = createServiceRequestInputSchema.safeParse({
      categoryId: '019b0000-0000-7000-8000-000000000001',
      title: 'Instalar luminárias na sala',
      description: 'Preciso instalar duas luminárias em pontos elétricos existentes.',
      locationApprox: {
        city: 'Salvador',
        state: 'BA',
        district: 'Pituba',
      },
      desiredWindow: {
        startsAt: '2026-08-20T12:00:00.000Z',
        endsAt: '2026-08-20T15:00:00.000Z',
        timezone: 'America/Bahia',
      },
      urgency: 'FLEXIBLE',
      budget: {
        minMinor: 40_000,
        maxMinor: 20_000,
        currency: 'BRL',
      },
      visibility: 'PRIVATE_MATCHED',
      proposalDeadline: '2026-08-21T12:00:00.000Z',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['budget.maxMinor', 'proposalDeadline']),
      );
    }
  });
});

describe('acceptProposalInputSchema', () => {
  it('requires an explicit revision and versioned acceptance text', () => {
    expect(
      acceptProposalInputSchema.safeParse({
        revisionId: '019b0000-0000-7000-8000-000000000901',
        acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
      }).success,
    ).toBe(true);

    expect(
      acceptProposalInputSchema.safeParse({
        revisionId: '019b0000-0000-7000-8000-000000000901',
        acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
        implicitlyAcceptedFees: true,
      }).success,
    ).toBe(false);
  });
});

describe('proposalAcceptanceSchema', () => {
  it('accepts a coherent unpaid contract snapshot', () => {
    expect(proposalAcceptanceSchema.safeParse(validProposalAcceptance()).success).toBe(true);
  });

  it('rejects state, amount and schedule combinations that diverge from the snapshot', () => {
    const inconsistent = validProposalAcceptance();
    inconsistent.paymentOrder.status = 'EXPIRED';
    inconsistent.paymentOrder.amount.amountMinor = 25_000;
    inconsistent.bookingHold.schedule = {
      ...inconsistent.bookingHold.schedule,
      endsAt: '2026-08-20T16:00:00.000Z',
    };

    const result = proposalAcceptanceSchema.safeParse(inconsistent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['contract.status', 'paymentOrder.amount', 'bookingHold.schedule']),
      );
    }
  });

  it('rejects identifiers and acceptance evidence that diverge from the snapshot', () => {
    const inconsistent = validProposalAcceptance();
    inconsistent.contract.snapshot.request.id = '019b0000-0000-7000-8000-000000000699';
    inconsistent.contract.snapshot.proposal.id = '019b0000-0000-7000-8000-000000000799';
    inconsistent.contract.acceptedAt = '2026-07-19T12:01:00.000Z';
    inconsistent.paymentOrder.contractId = '019b0000-0000-7000-8000-000000000899';

    const result = proposalAcceptanceSchema.safeParse(inconsistent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining([
          'contract.requestId',
          'contract.proposalId',
          'contract.acceptedAt',
          'paymentOrder.contractId',
        ]),
      );
    }
  });

  it('rejects acceptance text or digest that does not match the canonical policy', () => {
    const inconsistent = validProposalAcceptance();
    inconsistent.contract.snapshot.acceptance.text = 'Texto alterado sem nova versão.';
    inconsistent.contract.snapshot.acceptance.textHash = 'b'.repeat(64);

    const result = proposalAcceptanceSchema.safeParse(inconsistent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining([
          'contract.snapshot.acceptance.text',
          'contract.snapshot.acceptance.textHash',
        ]),
      );
    }
  });
});
