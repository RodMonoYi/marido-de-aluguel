import {
  calculateDemoProposalBreakdown,
  DEMO_CANCELLATION_POLICY,
  type ProposalRevisionInput,
} from '@marido/contracts';
import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { calculateBreakdown, CANCELLATION_POLICY } from './marketplace-policy';

function proposalInput(amounts: ProposalRevisionInput['amounts']): ProposalRevisionInput {
  return {
    scope: 'Execução integral do serviço descrito na proposta comercial.',
    included: ['Mão de obra descrita no escopo'],
    excluded: [],
    amounts,
    schedule: {
      startsAt: '2030-08-20T13:00:00.000Z',
      endsAt: '2030-08-20T15:00:00.000Z',
      timezone: 'America/Bahia',
    },
    validUntil: '2030-08-19T21:00:00.000Z',
    guaranteeOffer: null,
  };
}

describe('marketplace canonical policies', () => {
  it('uses the shared commercial calculator without redefining its rules', () => {
    const amounts = {
      laborMinor: 24_000,
      materialsMinor: 2_000,
      travelMinor: 0,
      currency: 'BRL' as const,
    };

    expect(calculateBreakdown(proposalInput(amounts))).toEqual(
      calculateDemoProposalBreakdown(amounts),
    );
  });

  it('reexports the exact shared cancellation policy', () => {
    expect(CANCELLATION_POLICY).toBe(DEMO_CANCELLATION_POLICY);
  });

  it('maps an unsafe aggregate amount to the public API error', () => {
    let thrown: unknown;

    try {
      calculateBreakdown(
        proposalInput({
          laborMinor: Number.MAX_SAFE_INTEGER,
          materialsMinor: 1,
          travelMinor: 0,
          currency: 'BRL',
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toEqual({
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Os valores da proposta excedem o limite suportado.',
    });
  });
});
