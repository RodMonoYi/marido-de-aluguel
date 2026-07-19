import { UnprocessableEntityException } from '@nestjs/common';
import {
  calculateDemoProposalBreakdown,
  DEMO_ACCEPTANCE_POLICY,
  DEMO_CANCELLATION_POLICY,
  type ProposalBreakdown,
  type ProposalRevisionInput,
} from '@marido/contracts';

export const ACCEPTANCE_TEXT_VERSION = DEMO_ACCEPTANCE_POLICY.version;
export const HOLD_DURATION_MINUTES = 10;

export const CANCELLATION_POLICY = DEMO_CANCELLATION_POLICY;

export function calculateBreakdown(input: ProposalRevisionInput): ProposalBreakdown {
  try {
    return calculateDemoProposalBreakdown(input.amounts);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    throw new UnprocessableEntityException({
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Os valores da proposta excedem o limite suportado.',
    });
  }
}
