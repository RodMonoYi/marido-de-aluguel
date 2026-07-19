import type { Proposal, ServiceRequest } from '@marido/contracts';

const ACTIVE_PROPOSAL_STATUSES = new Set<Proposal['status']>([
  'SENT',
  'VIEWED',
  'NEGOTIATING',
  'REVISED',
]);

export function isRequestOpenForProposals(request: ServiceRequest, now = Date.now()): boolean {
  return (
    request.status === 'PUBLISHED' &&
    Date.parse(request.proposalDeadline) > now &&
    Date.parse(request.desiredWindow.startsAt) > now
  );
}

export function isProposalCurrent(proposal: Proposal, now = Date.now()): boolean {
  return (
    ACTIVE_PROPOSAL_STATUSES.has(proposal.status) &&
    Date.parse(proposal.currentRevision.validUntil) > now &&
    Date.parse(proposal.currentRevision.schedule.startsAt) > now
  );
}

export function canReviseProposal(
  request: ServiceRequest,
  proposal: Proposal,
  now = Date.now(),
): boolean {
  return isRequestOpenForProposals(request, now) && isProposalCurrent(proposal, now);
}

export function canAcceptProposal(
  request: ServiceRequest,
  proposal: Proposal,
  now = Date.now(),
): boolean {
  return isRequestOpenForProposals(request, now) && isProposalCurrent(proposal, now);
}
