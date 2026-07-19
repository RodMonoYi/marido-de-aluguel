import { DEMO_ACCEPTANCE_POLICY } from '@marido/contracts';
import { Equals, IsUUID } from 'class-validator';

export class AcceptProposalDto {
  @IsUUID()
  declare revisionId: string;

  @Equals(DEMO_ACCEPTANCE_POLICY.version)
  declare acceptanceTextVersion: typeof DEMO_ACCEPTANCE_POLICY.version;
}
