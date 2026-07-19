import type {
  BookingHold,
  Contract,
  CreateServiceRequestInput,
  DEMO_ACCEPTANCE_POLICY,
  DemoActor,
  PaymentOrder,
  Proposal,
  ProposalAcceptance,
  ProposalBreakdown,
  ProposalRevision,
  ProposalRevisionInput,
  ServiceRequest,
} from '@marido/contracts';

export interface CommandContext {
  actor: DemoActor;
  correlationId: string;
  idempotencyKey: string;
  requestHash: string;
}

export interface PreparedProposalRevision {
  input: ProposalRevisionInput;
  breakdown: ProposalBreakdown;
  snapshotHash: string;
}

export interface CreateRequestCommand extends CommandContext {
  id: string;
  input: CreateServiceRequestInput;
  sanitizedTitle: string;
  sanitizedDescription: string;
}

export interface PublishRequestCommand extends CommandContext {
  requestId: string;
  expectedVersion: number;
}

export interface CreateProposalCommand extends CommandContext {
  proposalId: string;
  revisionId: string;
  requestId: string;
  revision: PreparedProposalRevision;
}

export interface ReviseProposalCommand extends CommandContext {
  proposalId: string;
  revisionId: string;
  expectedVersion: number;
  revision: PreparedProposalRevision;
}

export interface AcceptProposalCommand extends CommandContext {
  proposalId: string;
  revisionId: string;
  expectedVersion: number;
  acceptanceTextVersion: typeof DEMO_ACCEPTANCE_POLICY.version;
  contractId: string;
  paymentOrderId: string;
  bookingHoldId: string;
  acceptedAt: string;
  holdExpiresAt: string;
}

export type MarketplaceErrorCode =
  | 'CATEGORY_NOT_AVAILABLE'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_NOT_DRAFT'
  | 'REQUEST_NOT_PUBLISHED'
  | 'REQUEST_VERSION_CONFLICT'
  | 'NO_ELIGIBLE_PROFESSIONALS'
  | 'PROFESSIONAL_NOT_ELIGIBLE'
  | 'PROPOSAL_ALREADY_EXISTS'
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_NOT_EDITABLE'
  | 'PROPOSAL_VERSION_CONFLICT'
  | 'PROPOSAL_REVISION_STALE'
  | 'PROPOSAL_EXPIRED'
  | 'SCHEDULE_OUTSIDE_REQUEST'
  | 'SLOT_UNAVAILABLE'
  | 'PROPOSAL_ALREADY_ACCEPTED'
  | 'TRANSACTION_RETRY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'CONTRACT_NOT_FOUND';

export class MarketplaceRepositoryError extends Error {
  constructor(readonly code: MarketplaceErrorCode) {
    super(code);
  }
}

export interface ContractView {
  contract: Contract;
  paymentOrder: PaymentOrder;
  bookingHold: BookingHold;
}

export abstract class MarketplaceRepository {
  abstract createRequest(command: CreateRequestCommand): Promise<ServiceRequest>;
  abstract publishRequest(command: PublishRequestCommand): Promise<ServiceRequest>;
  abstract listOwnRequests(actorId: string): Promise<ServiceRequest[]>;
  abstract listOpportunities(professionalId: string): Promise<ServiceRequest[]>;
  abstract findRequest(requestId: string, actor: DemoActor): Promise<ServiceRequest | null>;
  abstract createProposal(command: CreateProposalCommand): Promise<Proposal>;
  abstract reviseProposal(command: ReviseProposalCommand): Promise<Proposal>;
  abstract listProposals(requestId: string, actor: DemoActor): Promise<Proposal[]>;
  abstract listProposalRevisions(proposalId: string, actor: DemoActor): Promise<ProposalRevision[]>;
  abstract acceptProposal(command: AcceptProposalCommand): Promise<ProposalAcceptance>;
  abstract findContract(
    contractId: string,
    actor: DemoActor,
    correlationId: string,
  ): Promise<ContractView | null>;
}
