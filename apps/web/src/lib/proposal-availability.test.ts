import type { Proposal, ServiceRequest } from '@marido/contracts';
import { describe, expect, it } from 'vitest';

import {
  canAcceptProposal,
  canReviseProposal,
  isRequestOpenForProposals,
} from './proposal-availability';

const now = Date.parse('2026-07-19T12:00:00.000Z');

const request = {
  status: 'PUBLISHED',
  proposalDeadline: '2026-07-20T12:00:00.000Z',
  desiredWindow: {
    startsAt: '2026-07-21T12:00:00.000Z',
  },
} as ServiceRequest;

const proposal = {
  status: 'SENT',
  currentRevision: {
    validUntil: '2026-07-20T12:00:00.000Z',
    schedule: {
      startsAt: '2026-07-21T12:00:00.000Z',
    },
  },
} as Proposal;

describe('proposal availability', () => {
  it('allows commands only while request and proposal are effectively active', () => {
    expect(isRequestOpenForProposals(request, now)).toBe(true);
    expect(canReviseProposal(request, proposal, now)).toBe(true);
    expect(canAcceptProposal(request, proposal, now)).toBe(true);
  });

  it.each([
    ['request deadline', { ...request, proposalDeadline: '2026-07-19T12:00:00.000Z' }],
    ['requested start', { ...request, desiredWindow: { startsAt: '2026-07-19T12:00:00.000Z' } }],
    ['terminal request state', { ...request, status: 'CONVERTED' as const }],
  ])('closes the request after %s', (_label, candidate) => {
    expect(isRequestOpenForProposals(candidate as ServiceRequest, now)).toBe(false);
  });

  it.each([
    ['revision validity', { ...proposal.currentRevision, validUntil: '2026-07-19T12:00:00.000Z' }],
    [
      'scheduled start',
      {
        ...proposal.currentRevision,
        schedule: { ...proposal.currentRevision.schedule, startsAt: '2026-07-19T12:00:00.000Z' },
      },
    ],
  ])('blocks commands after %s', (_label, currentRevision) => {
    const candidate = { ...proposal, currentRevision } as Proposal;

    expect(canReviseProposal(request, candidate, now)).toBe(false);
    expect(canAcceptProposal(request, candidate, now)).toBe(false);
  });

  it('blocks terminal proposal states even before the worker materializes timeouts', () => {
    const converted = { ...proposal, status: 'CONVERTED' as const };

    expect(canReviseProposal(request, converted, now)).toBe(false);
    expect(canAcceptProposal(request, converted, now)).toBe(false);
  });
});
