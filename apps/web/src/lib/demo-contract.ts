import type {
  AcceptProposalInput,
  ApiErrorEnvelope,
  ApiMeta,
  BookingHold,
  Contract,
  CreateServiceRequestInput,
  PaymentOrder,
  Proposal,
  ProposalAcceptance,
  ProposalRevision,
  ProposalRevisionInput,
  ServiceRequest,
} from '@marido/contracts';

/**
 * Increment 2 API contract consumed by the web app.
 *
 * Canonical routes:
 * - POST /service-requests
 * - POST /service-requests/:id/publish
 * - GET /service-requests?scope=mine|opportunities
 * - GET /service-requests/:id
 * - GET|POST /service-requests/:id/proposals
 * - POST /proposals/:id/revisions
 * - POST /proposals/:id/accept
 * - GET /contracts/:id
 *
 * Restricted requests carry X-Demo-Actor-Id. Acceptance additionally carries
 * Idempotency-Key and identifies an immutable proposal revision.
 */

export type {
  AcceptProposalInput,
  ApiErrorEnvelope as DemoApiErrorEnvelope,
  BookingHold as DemoBookingHold,
  Contract as DemoContract,
  CreateServiceRequestInput,
  PaymentOrder as DemoPaymentOrder,
  Proposal as DemoProposal,
  ProposalAcceptance as AcceptProposalResult,
  ProposalRevision as DemoProposalRevision,
  ProposalRevisionInput,
  ServiceRequest as DemoServiceRequest,
};

export interface DemoApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}
