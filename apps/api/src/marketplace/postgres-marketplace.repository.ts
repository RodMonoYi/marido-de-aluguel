import { Injectable } from '@nestjs/common';
import {
  DEMO_ACCEPTANCE_POLICY,
  type BookingHold,
  type Contract,
  type ContractSnapshot,
  type DemoActor,
  type PaymentOrder,
  type Proposal,
  type ProposalAcceptance,
  type ProposalRevision,
  type RequestBudget,
  type ServiceRequest,
} from '@marido/contracts';
import { DatabaseError, type QueryResultRow } from 'pg';
import { uuidv7 } from 'uuidv7';

import { DatabaseService, type QueryExecutor } from '../database/database.service';
import { digest } from './marketplace-integrity';
import {
  MarketplaceRepository,
  MarketplaceRepositoryError,
  type AcceptProposalCommand,
  type CommandContext,
  type ContractView,
  type CreateProposalCommand,
  type CreateRequestCommand,
  type PreparedProposalRevision,
  type PublishRequestCommand,
  type ReviseProposalCommand,
} from './marketplace.repository';
import { CANCELLATION_POLICY } from './marketplace-policy';
import { hasCurrentPrivateMatchEligibility } from './private-match-eligibility';

interface RequestRow extends QueryResultRow {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  locationCity: string;
  locationState: string;
  locationDistrict: string | null;
  desiredStartsAt: Date;
  desiredEndsAt: Date;
  desiredTimezone: string;
  urgency: ServiceRequest['urgency'];
  budgetProvided: boolean;
  budgetMinMinor: string | null;
  budgetMaxMinor: string | null;
  currency: 'BRL';
  visibility: 'PRIVATE_MATCHED';
  status: ServiceRequest['status'];
  version: number;
  proposalDeadline: Date;
  proposalCount: number;
  createdAt: Date;
  publishedAt: Date | null;
}

interface ProposalRow extends QueryResultRow {
  id: string;
  requestId: string;
  professionalId: string;
  professionalSlug: string;
  professionalDisplayName: string;
  status: Proposal['status'];
  version: number;
  revisionId: string;
  revisionVersion: number;
  scope: string;
  included: string[];
  excluded: string[];
  laborMinor: string;
  materialsMinor: string;
  travelMinor: string;
  customerPlatformFeeMinor: string;
  professionalCommissionMinor: string;
  customerTotalMinor: string;
  professionalNetEstimateMinor: string;
  currency: 'BRL';
  commercialPolicyCode: string;
  commercialPolicyVersion: number;
  commercialPolicyDevelopmentOnly: true;
  scheduledStartsAt: Date;
  scheduledEndsAt: Date;
  scheduledTimezone: string;
  validUntil: Date;
  cancellationPolicyCode: string;
  cancellationPolicyVersion: number;
  cancellationPolicyLabel: string;
  guaranteeOffer: string | null;
  revisionCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface LockedRequestRow extends QueryResultRow {
  id: string;
  customerActorId: string;
  categoryId: string;
  status: ServiceRequest['status'];
  version: number;
  proposalDeadline: Date;
  desiredStartsAt: Date;
  desiredEndsAt: Date;
  desiredTimezone: string;
}

interface LockedProposalRow extends QueryResultRow {
  id: string;
  requestId: string;
  professionalId: string;
  professionalActorId: string;
  status: Proposal['status'];
  version: number;
  currentRevisionId: string;
  customerActorId: string;
  requestStatus: ServiceRequest['status'];
  categoryId: string;
  proposalDeadline: Date;
  desiredStartsAt: Date;
  desiredEndsAt: Date;
  desiredTimezone: string;
}

interface IdempotencyRow extends QueryResultRow {
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responsePayload: unknown | null;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface ResourceRow extends QueryResultRow {
  id: string;
  timezone: string;
}

interface ExpiredHoldRow extends QueryResultRow {
  contractId: string;
  holdId: string;
}

interface TemporalRequestRow extends QueryResultRow {
  id: string;
  version: number;
  proposalDeadlineElapsed: boolean;
  desiredStartElapsed: boolean;
}

interface TemporalProposalRow extends QueryResultRow {
  id: string;
  status: Proposal['status'];
  version: number;
  validityElapsed: boolean;
  scheduleStartElapsed: boolean;
}

interface ContractRow extends QueryResultRow {
  contractId: string;
  requestId: string;
  proposalId: string;
  acceptedRevisionId: string;
  contractStatus: Contract['status'];
  contractVersion: number;
  snapshot: ContractSnapshot;
  snapshotHash: string;
  acceptanceTextVersion: typeof DEMO_ACCEPTANCE_POLICY.version;
  acceptedAt: Date;
  paymentOrderId: string;
  paymentOrderStatus: PaymentOrder['status'];
  amountMinor: string;
  currency: 'BRL';
  checkoutAvailable: false;
  paymentCreatedAt: Date;
  bookingHoldId: string;
  holdStatus: BookingHold['status'];
  holdStartsAt: Date;
  holdEndsAt: Date;
  holdTimezone: string;
  holdExpiresAt: Date;
  holdCreatedAt: Date;
}

export interface MarketplaceMaintenanceResult {
  expiredServiceRequests: number;
  expiredProposals: number;
  expiredHolds: number;
  deletedIdempotencyRecords: number;
}

const IDEMPOTENCY_RETENTION_SECONDS = 24 * 60 * 60;
const EDITABLE_PROPOSAL_STATUSES: Proposal['status'][] = [
  'SENT',
  'VIEWED',
  'NEGOTIATING',
  'REVISED',
];

const REQUEST_SELECT = `
  SELECT
    request.id,
    request.title,
    request.description,
    category.id AS "categoryId",
    category.slug AS "categorySlug",
    category.name AS "categoryName",
    request.location_city AS "locationCity",
    request.location_state AS "locationState",
    request.location_district AS "locationDistrict",
    request.desired_starts_at AS "desiredStartsAt",
    request.desired_ends_at AS "desiredEndsAt",
    request.desired_timezone AS "desiredTimezone",
    request.urgency,
    request.budget_provided AS "budgetProvided",
    request.budget_min_minor AS "budgetMinMinor",
    request.budget_max_minor AS "budgetMaxMinor",
    request.currency,
    request.visibility,
    request.status,
    request.version,
    request.proposal_deadline AS "proposalDeadline",
    (
      SELECT COUNT(*)::int
      FROM marketplace.proposals proposal
      WHERE proposal.request_id = request.id
    ) AS "proposalCount",
    request.created_at AS "createdAt",
    request.published_at AS "publishedAt"
  FROM marketplace.service_requests request
  JOIN catalog.categories category ON category.id = request.category_id
`;

const PROPOSAL_SELECT = `
  SELECT
    proposal.id,
    proposal.request_id AS "requestId",
    profile.id AS "professionalId",
    profile.slug AS "professionalSlug",
    profile.display_name AS "professionalDisplayName",
    proposal.status,
    proposal.version,
    revision.id AS "revisionId",
    revision.version AS "revisionVersion",
    revision.scope,
    revision.included,
    revision.excluded,
    revision.labor_minor AS "laborMinor",
    revision.materials_minor AS "materialsMinor",
    revision.travel_minor AS "travelMinor",
    revision.customer_platform_fee_minor AS "customerPlatformFeeMinor",
    revision.professional_commission_minor AS "professionalCommissionMinor",
    revision.customer_total_minor AS "customerTotalMinor",
    revision.professional_net_estimate_minor AS "professionalNetEstimateMinor",
    revision.currency,
    revision.commercial_policy_code AS "commercialPolicyCode",
    revision.commercial_policy_version AS "commercialPolicyVersion",
    revision.commercial_policy_development_only AS "commercialPolicyDevelopmentOnly",
    revision.scheduled_starts_at AS "scheduledStartsAt",
    revision.scheduled_ends_at AS "scheduledEndsAt",
    revision.scheduled_timezone AS "scheduledTimezone",
    revision.valid_until AS "validUntil",
    revision.cancellation_policy_code AS "cancellationPolicyCode",
    revision.cancellation_policy_version AS "cancellationPolicyVersion",
    revision.cancellation_policy_label AS "cancellationPolicyLabel",
    revision.guarantee_offer AS "guaranteeOffer",
    revision.created_at AS "revisionCreatedAt",
    proposal.created_at AS "createdAt",
    proposal.updated_at AS "updatedAt"
  FROM marketplace.proposals proposal
  JOIN marketplace.proposal_revisions revision
    ON revision.id = proposal.current_revision_id
    AND revision.proposal_id = proposal.id
  JOIN catalog.professional_profiles profile ON profile.id = proposal.professional_id
`;

function numberFromBigint(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Persisted monetary amount is outside the safe integer range');
  }
  return parsed;
}

function toBudget(row: RequestRow): RequestBudget | null {
  if (!row.budgetProvided) {
    return null;
  }
  return {
    ...(row.budgetMinMinor === null ? {} : { minMinor: numberFromBigint(row.budgetMinMinor) }),
    ...(row.budgetMaxMinor === null ? {} : { maxMinor: numberFromBigint(row.budgetMaxMinor) }),
    currency: 'BRL',
  };
}

function toRequest(row: RequestRow): ServiceRequest {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: {
      id: row.categoryId,
      slug: row.categorySlug,
      name: row.categoryName,
    },
    locationApprox: {
      city: row.locationCity,
      state: row.locationState,
      ...(row.locationDistrict ? { district: row.locationDistrict } : {}),
    },
    desiredWindow: {
      startsAt: row.desiredStartsAt.toISOString(),
      endsAt: row.desiredEndsAt.toISOString(),
      timezone: row.desiredTimezone,
    },
    urgency: row.urgency,
    budget: toBudget(row),
    visibility: row.visibility,
    status: row.status,
    version: Number(row.version),
    proposalDeadline: row.proposalDeadline.toISOString(),
    proposalCount: Number(row.proposalCount),
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toRevision(row: ProposalRow): ProposalRevision {
  return {
    id: row.revisionId,
    version: Number(row.revisionVersion),
    scope: row.scope,
    included: row.included,
    excluded: row.excluded,
    breakdown: {
      laborMinor: numberFromBigint(row.laborMinor),
      materialsMinor: numberFromBigint(row.materialsMinor),
      travelMinor: numberFromBigint(row.travelMinor),
      customerPlatformFeeMinor: numberFromBigint(row.customerPlatformFeeMinor),
      professionalCommissionMinor: numberFromBigint(row.professionalCommissionMinor),
      customerTotalMinor: numberFromBigint(row.customerTotalMinor),
      professionalNetEstimateMinor: numberFromBigint(row.professionalNetEstimateMinor),
      currency: row.currency,
      policy: {
        code: row.commercialPolicyCode,
        version: Number(row.commercialPolicyVersion),
        developmentOnly: row.commercialPolicyDevelopmentOnly,
      },
    },
    schedule: {
      startsAt: row.scheduledStartsAt.toISOString(),
      endsAt: row.scheduledEndsAt.toISOString(),
      timezone: row.scheduledTimezone,
    },
    validUntil: row.validUntil.toISOString(),
    policies: {
      cancellation: {
        code: row.cancellationPolicyCode,
        version: Number(row.cancellationPolicyVersion),
        label: row.cancellationPolicyLabel,
      },
      guarantee: row.guaranteeOffer
        ? { offeredBy: 'PROFESSIONAL', text: row.guaranteeOffer }
        : null,
    },
    createdAt: row.revisionCreatedAt.toISOString(),
  };
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    requestId: row.requestId,
    professional: {
      id: row.professionalId,
      slug: row.professionalSlug,
      displayName: row.professionalDisplayName,
    },
    status: row.status,
    version: Number(row.version),
    currentRevision: toRevision(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toContractView(row: ContractRow): ContractView {
  if (digest(row.snapshot) !== row.snapshotHash) {
    throw new Error('Persisted contract snapshot failed its integrity check');
  }

  return {
    contract: {
      id: row.contractId,
      requestId: row.requestId,
      proposalId: row.proposalId,
      acceptedRevisionId: row.acceptedRevisionId,
      status: row.contractStatus,
      version: Number(row.contractVersion),
      snapshotHash: row.snapshotHash,
      acceptanceTextVersion: row.acceptanceTextVersion,
      acceptedAt: row.acceptedAt.toISOString(),
      snapshot: row.snapshot,
    },
    paymentOrder: {
      id: row.paymentOrderId,
      contractId: row.contractId,
      status: row.paymentOrderStatus,
      amount: {
        amountMinor: numberFromBigint(row.amountMinor),
        currency: row.currency,
      },
      checkoutAvailable: row.checkoutAvailable,
      createdAt: row.paymentCreatedAt.toISOString(),
    },
    bookingHold: {
      id: row.bookingHoldId,
      contractId: row.contractId,
      status: row.holdStatus,
      schedule: {
        startsAt: row.holdStartsAt.toISOString(),
        endsAt: row.holdEndsAt.toISOString(),
        timezone: row.holdTimezone,
      },
      expiresAt: row.holdExpiresAt.toISOString(),
      createdAt: row.holdCreatedAt.toISOString(),
    },
  };
}

@Injectable()
export class PostgresMarketplaceRepository extends MarketplaceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async createRequest(command: CreateRequestCommand): Promise<ServiceRequest> {
    return this.database.transaction(async (executor) => {
      const replay = await this.claim<ServiceRequest>(executor, command, 'service-request:create');
      if (replay) return replay;

      const category = await executor.query(
        `
          SELECT id
          FROM catalog.categories
          WHERE id = $1
            AND status = 'ACTIVE'
            AND risk_level IN ('LOW', 'MODERATE')
        `,
        [command.input.categoryId],
      );
      if (!category.rowCount) {
        throw new MarketplaceRepositoryError('CATEGORY_NOT_AVAILABLE');
      }

      await executor.query(
        `
          INSERT INTO marketplace.service_requests (
            id,
            customer_actor_id,
            category_id,
            title,
            description,
            sanitized_title,
            sanitized_description,
            location_city,
            location_state,
            location_district,
            desired_starts_at,
            desired_ends_at,
            desired_timezone,
            urgency,
            budget_min_minor,
            budget_max_minor,
            budget_provided,
            currency,
            visibility,
            status,
            proposal_deadline
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, 'BRL',
            'PRIVATE_MATCHED', 'DRAFT', $18
          )
        `,
        [
          command.id,
          command.actor.id,
          command.input.categoryId,
          command.input.title.trim(),
          command.input.description.trim(),
          command.sanitizedTitle,
          command.sanitizedDescription,
          command.input.locationApprox.city.trim(),
          command.input.locationApprox.state,
          command.input.locationApprox.district?.trim() ?? null,
          command.input.desiredWindow.startsAt,
          command.input.desiredWindow.endsAt,
          command.input.desiredWindow.timezone,
          command.input.urgency,
          command.input.budget?.minMinor ?? null,
          command.input.budget?.maxMinor ?? null,
          command.input.budget !== null && command.input.budget !== undefined,
          command.input.proposalDeadline,
        ],
      );

      const request = await this.loadRequest(executor, command.id, false);
      if (!request) throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');

      await this.recordAudit(
        executor,
        command,
        'ServiceRequestCreated',
        'ServiceRequest',
        command.id,
        {
          status: request.status,
          version: request.version,
        },
      );
      await this.recordEvent(executor, command, 'RequestCreated', 'ServiceRequest', command.id, 1, {
        requestId: command.id,
        categoryId: command.input.categoryId,
        status: 'DRAFT',
      });
      await this.complete(executor, command, 'service-request:create', request);
      return request;
    });
  }

  async publishRequest(command: PublishRequestCommand): Promise<ServiceRequest> {
    return this.database.transaction(async (executor) => {
      const replay = await this.claim<ServiceRequest>(
        executor,
        command,
        `service-request:${command.requestId}:publish`,
      );
      if (replay) return replay;

      const locked = await executor.query<LockedRequestRow>(
        `
          SELECT
            request.id,
            request.customer_actor_id AS "customerActorId",
            request.category_id AS "categoryId",
            request.status,
            request.version,
            request.proposal_deadline AS "proposalDeadline",
            request.desired_starts_at AS "desiredStartsAt",
            request.desired_ends_at AS "desiredEndsAt",
            request.desired_timezone AS "desiredTimezone"
          FROM marketplace.service_requests request
          WHERE request.id = $1
            AND request.customer_actor_id = $2
          FOR UPDATE
        `,
        [command.requestId, command.actor.id],
      );
      const request = locked.rows[0];
      if (!request) throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');
      if (request.status !== 'DRAFT') {
        throw new MarketplaceRepositoryError('REQUEST_NOT_DRAFT');
      }
      if (Number(request.version) !== command.expectedVersion) {
        throw new MarketplaceRepositoryError('REQUEST_VERSION_CONFLICT');
      }
      if (
        request.proposalDeadline.getTime() <= Date.now() ||
        request.desiredStartsAt.getTime() <= Date.now()
      ) {
        throw new MarketplaceRepositoryError('REQUEST_NOT_DRAFT');
      }

      const recipients = await executor.query<CountRow>(
        `
          WITH eligible AS (
            SELECT eligibility.professional_id
            FROM marketplace.private_match_eligibility eligibility
            WHERE eligibility.request_id = $1
          ),
          inserted AS (
            INSERT INTO marketplace.opportunity_recipients (
              request_id, professional_id, eligibility_reason
            )
            SELECT $1, eligible.professional_id, 'CATEGORY_AND_SERVICE_AREA_MATCH'
            FROM eligible
            ON CONFLICT DO NOTHING
            RETURNING professional_id
          )
          SELECT COUNT(*)::int AS count
          FROM eligible
        `,
        [request.id],
      );
      if ((recipients.rows[0]?.count ?? 0) === 0) {
        throw new MarketplaceRepositoryError('NO_ELIGIBLE_PROFESSIONALS');
      }

      const version = Number(request.version) + 1;
      await executor.query(
        `
          UPDATE marketplace.service_requests
          SET
            status = 'PUBLISHED',
            version = $2,
            published_at = now(),
            updated_at = now()
          WHERE id = $1
        `,
        [request.id, version],
      );

      const published = await this.loadRequest(executor, request.id, false);
      if (!published) throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');

      await this.recordAudit(
        executor,
        command,
        'ServiceRequestPublished',
        'ServiceRequest',
        request.id,
        {
          status: 'PUBLISHED',
          version,
        },
      );
      await this.recordEvent(
        executor,
        command,
        'RequestPublished',
        'ServiceRequest',
        request.id,
        version,
        { requestId: request.id, categoryId: request.categoryId, status: 'PUBLISHED' },
      );
      await this.complete(
        executor,
        command,
        `service-request:${command.requestId}:publish`,
        published,
      );
      return published;
    });
  }

  async listOwnRequests(actorId: string): Promise<ServiceRequest[]> {
    const result = await this.database.query<RequestRow>(
      `${REQUEST_SELECT}
       WHERE request.customer_actor_id = $1
       ORDER BY request.created_at DESC, request.id`,
      [actorId],
    );
    return result.rows.map(toRequest);
  }

  async listOpportunities(professionalId: string): Promise<ServiceRequest[]> {
    const result = await this.database.query<RequestRow>(
      `
        ${REQUEST_SELECT.replace('request.title,', 'request.sanitized_title AS title,').replace(
          'request.description,',
          'request.sanitized_description AS description,',
        )}
        JOIN marketplace.opportunity_recipients recipient
          ON recipient.request_id = request.id
        JOIN marketplace.private_match_eligibility eligibility
          ON eligibility.request_id = recipient.request_id
          AND eligibility.professional_id = recipient.professional_id
        WHERE recipient.professional_id = $1
          AND request.status = 'PUBLISHED'
          AND request.proposal_deadline > now()
        ORDER BY request.proposal_deadline, request.id
      `,
      [professionalId],
    );
    return result.rows.map(toRequest);
  }

  async findRequest(requestId: string, actor: DemoActor): Promise<ServiceRequest | null> {
    const sanitized = actor.role === 'PROFESSIONAL';
    const select = sanitized
      ? REQUEST_SELECT.replace('request.title,', 'request.sanitized_title AS title,').replace(
          'request.description,',
          'request.sanitized_description AS description,',
        )
      : REQUEST_SELECT;
    const result = await this.database.query<RequestRow>(
      actor.role === 'CLIENT'
        ? `${select}
           WHERE request.id = $1
             AND request.customer_actor_id = $2`
        : `${select}
           JOIN marketplace.opportunity_recipients recipient
             ON recipient.request_id = request.id
           LEFT JOIN marketplace.private_match_eligibility eligibility
             ON eligibility.request_id = recipient.request_id
             AND eligibility.professional_id = recipient.professional_id
           WHERE request.id = $1
             AND recipient.professional_id = $2
             AND request.status IN ('PUBLISHED', 'CONVERTED')
             AND (
               request.status = 'CONVERTED'
               OR eligibility.professional_id IS NOT NULL
               OR EXISTS (
                 SELECT 1
                 FROM marketplace.proposals own_proposal
                 WHERE own_proposal.request_id = request.id
                   AND own_proposal.professional_id = recipient.professional_id
               )
             )`,
      [requestId, actor.role === 'CLIENT' ? actor.id : actor.professionalId],
    );
    const row = result.rows[0];
    return row ? toRequest(row) : null;
  }

  async createProposal(command: CreateProposalCommand): Promise<Proposal> {
    try {
      return await this.database.transaction(async (executor) => {
        const replay = await this.claim<Proposal>(
          executor,
          command,
          `service-request:${command.requestId}:proposal:create`,
        );
        if (replay) return replay;

        const request = await this.lockRequestForProposal(
          executor,
          command.requestId,
          command.actor,
        );
        this.validateRevisionAgainstRequest(request, command.revision);

        await executor.query(
          `
            INSERT INTO marketplace.proposals (
              id, request_id, professional_id, status, version
            )
            VALUES ($1, $2, $3, 'SENT', 1)
          `,
          [command.proposalId, command.requestId, command.actor.professionalId],
        );
        await this.insertRevision(
          executor,
          command.proposalId,
          command.revisionId,
          1,
          command.revision,
        );
        await executor.query(
          `
            UPDATE marketplace.proposals
            SET current_revision_id = $2
            WHERE id = $1
          `,
          [command.proposalId, command.revisionId],
        );

        const proposal = await this.loadProposal(executor, command.proposalId);
        if (!proposal) throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');

        await this.recordAudit(executor, command, 'ProposalSent', 'Proposal', proposal.id, {
          requestId: command.requestId,
          revisionId: command.revisionId,
          version: 1,
        });
        await this.recordEvent(executor, command, 'ProposalSent', 'Proposal', proposal.id, 1, {
          proposalId: proposal.id,
          requestId: command.requestId,
          revisionId: command.revisionId,
          professionalId: command.actor.professionalId,
        });
        await this.complete(
          executor,
          command,
          `service-request:${command.requestId}:proposal:create`,
          proposal,
        );
        return proposal;
      });
    } catch (error) {
      if (error instanceof DatabaseError && error.code === '23505') {
        throw new MarketplaceRepositoryError('PROPOSAL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async reviseProposal(command: ReviseProposalCommand): Promise<Proposal> {
    return this.database.transaction(async (executor) => {
      const replay = await this.claim<Proposal>(
        executor,
        command,
        `proposal:${command.proposalId}:revise`,
      );
      if (replay) return replay;

      const proposal = await this.lockProposal(executor, command.proposalId);
      if (
        !proposal ||
        command.actor.role !== 'PROFESSIONAL' ||
        proposal.professionalId !== command.actor.professionalId
      ) {
        throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
      }
      if (!['SENT', 'VIEWED', 'NEGOTIATING', 'REVISED'].includes(proposal.status)) {
        throw new MarketplaceRepositoryError('PROPOSAL_NOT_EDITABLE');
      }
      if (Number(proposal.version) !== command.expectedVersion) {
        throw new MarketplaceRepositoryError('PROPOSAL_VERSION_CONFLICT');
      }
      if (
        !(await hasCurrentPrivateMatchEligibility(
          executor,
          proposal.requestId,
          proposal.professionalId,
        ))
      ) {
        throw new MarketplaceRepositoryError('PROFESSIONAL_NOT_ELIGIBLE');
      }
      this.validateRevisionAgainstRequest(proposal, command.revision);

      const version = Number(proposal.version) + 1;
      await this.insertRevision(
        executor,
        proposal.id,
        command.revisionId,
        version,
        command.revision,
      );
      await executor.query(
        `
          UPDATE marketplace.proposals
          SET
            current_revision_id = $2,
            status = 'REVISED',
            version = $3,
            updated_at = now()
          WHERE id = $1
        `,
        [proposal.id, command.revisionId, version],
      );

      const revised = await this.loadProposal(executor, proposal.id);
      if (!revised) throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');

      await this.recordAudit(executor, command, 'ProposalRevised', 'Proposal', proposal.id, {
        revisionId: command.revisionId,
        version,
      });
      await this.recordEvent(
        executor,
        command,
        'ProposalRevised',
        'Proposal',
        proposal.id,
        version,
        {
          proposalId: proposal.id,
          revisionId: command.revisionId,
          version,
        },
      );
      await this.complete(executor, command, `proposal:${command.proposalId}:revise`, revised);
      return revised;
    });
  }

  async listProposals(requestId: string, actor: DemoActor): Promise<Proposal[]> {
    const request = await this.findRequest(requestId, actor);
    if (!request) throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');

    const result = await this.database.query<ProposalRow>(
      actor.role === 'CLIENT'
        ? `${PROPOSAL_SELECT}
           WHERE proposal.request_id = $1
           ORDER BY proposal.created_at, proposal.id`
        : `${PROPOSAL_SELECT}
           WHERE proposal.request_id = $1
             AND proposal.professional_id = $2
           ORDER BY proposal.created_at, proposal.id`,
      actor.role === 'CLIENT' ? [requestId] : [requestId, actor.professionalId],
    );
    return result.rows.map(toProposal);
  }

  async listProposalRevisions(proposalId: string, actor: DemoActor): Promise<ProposalRevision[]> {
    const result = await this.database.query<ProposalRow>(
      `
        SELECT
          proposal.id,
          proposal.request_id AS "requestId",
          profile.id AS "professionalId",
          profile.slug AS "professionalSlug",
          profile.display_name AS "professionalDisplayName",
          proposal.status,
          proposal.version,
          revision.id AS "revisionId",
          revision.version AS "revisionVersion",
          revision.scope,
          revision.included,
          revision.excluded,
          revision.labor_minor AS "laborMinor",
          revision.materials_minor AS "materialsMinor",
          revision.travel_minor AS "travelMinor",
          revision.customer_platform_fee_minor AS "customerPlatformFeeMinor",
          revision.professional_commission_minor AS "professionalCommissionMinor",
          revision.customer_total_minor AS "customerTotalMinor",
          revision.professional_net_estimate_minor AS "professionalNetEstimateMinor",
          revision.currency,
          revision.commercial_policy_code AS "commercialPolicyCode",
          revision.commercial_policy_version AS "commercialPolicyVersion",
          revision.commercial_policy_development_only AS "commercialPolicyDevelopmentOnly",
          revision.scheduled_starts_at AS "scheduledStartsAt",
          revision.scheduled_ends_at AS "scheduledEndsAt",
          revision.scheduled_timezone AS "scheduledTimezone",
          revision.valid_until AS "validUntil",
          revision.cancellation_policy_code AS "cancellationPolicyCode",
          revision.cancellation_policy_version AS "cancellationPolicyVersion",
          revision.cancellation_policy_label AS "cancellationPolicyLabel",
          revision.guarantee_offer AS "guaranteeOffer",
          revision.created_at AS "revisionCreatedAt",
          proposal.created_at AS "createdAt",
          proposal.updated_at AS "updatedAt"
        FROM marketplace.proposals proposal
        JOIN marketplace.service_requests request ON request.id = proposal.request_id
        JOIN marketplace.proposal_revisions revision
          ON revision.proposal_id = proposal.id
        JOIN catalog.professional_profiles profile ON profile.id = proposal.professional_id
        JOIN identity.demo_actors professional_actor
          ON professional_actor.professional_id = proposal.professional_id
          AND professional_actor.role = 'PROFESSIONAL'
        WHERE proposal.id = $1
          AND (
            request.customer_actor_id = $2
            OR professional_actor.id = $2
          )
        ORDER BY revision.version, revision.id
      `,
      [proposalId, actor.id],
    );
    if (!result.rowCount) {
      throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
    }
    return result.rows.map(toRevision);
  }

  async acceptProposal(command: AcceptProposalCommand): Promise<ProposalAcceptance> {
    try {
      return await this.database.transaction(async (executor) => {
        const replay = await this.claim<ProposalAcceptance>(
          executor,
          command,
          `proposal:${command.proposalId}:accept`,
        );
        if (replay) return replay;

        const locked = await this.lockProposal(executor, command.proposalId);
        if (
          !locked ||
          command.actor.role !== 'CLIENT' ||
          locked.customerActorId !== command.actor.id
        ) {
          throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
        }
        if (locked.status === 'CONVERTED') {
          throw new MarketplaceRepositoryError('PROPOSAL_ALREADY_ACCEPTED');
        }
        if (!['SENT', 'VIEWED', 'NEGOTIATING', 'REVISED'].includes(locked.status)) {
          throw new MarketplaceRepositoryError('PROPOSAL_NOT_EDITABLE');
        }
        if (Number(locked.version) !== command.expectedVersion) {
          throw new MarketplaceRepositoryError('PROPOSAL_VERSION_CONFLICT');
        }
        if (locked.currentRevisionId !== command.revisionId) {
          throw new MarketplaceRepositoryError('PROPOSAL_REVISION_STALE');
        }
        if (locked.requestStatus !== 'PUBLISHED') {
          throw new MarketplaceRepositoryError('REQUEST_NOT_PUBLISHED');
        }

        const currentProposal = await this.loadProposal(executor, locked.id);
        const request = await this.loadRequest(executor, locked.requestId, false);
        if (!currentProposal || !request) {
          throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
        }
        const revision = currentProposal.currentRevision;
        if (
          new Date(revision.validUntil).getTime() <= Date.now() ||
          new Date(revision.schedule.startsAt).getTime() <= Date.now()
        ) {
          throw new MarketplaceRepositoryError('PROPOSAL_EXPIRED');
        }
        this.validateSchedule(
          revision.schedule.startsAt,
          revision.schedule.endsAt,
          revision.schedule.timezone,
          locked,
        );

        if (
          !(await hasCurrentPrivateMatchEligibility(
            executor,
            locked.requestId,
            locked.professionalId,
          ))
        ) {
          throw new MarketplaceRepositoryError('PROFESSIONAL_NOT_ELIGIBLE');
        }

        const resourceResult = await executor.query<ResourceRow>(
          `
              SELECT id, timezone
              FROM scheduling.calendar_resources
              WHERE professional_id = $1
                AND status = 'ACTIVE'
              FOR UPDATE
            `,
          [locked.professionalId],
        );
        const resource = resourceResult.rows[0];
        if (!resource || resource.timezone !== revision.schedule.timezone) {
          throw new MarketplaceRepositoryError('SLOT_UNAVAILABLE');
        }

        await this.expireHolds(executor, command.correlationId, {
          resourceId: resource.id,
        });

        const contractSnapshot: ContractSnapshot = {
          request: {
            id: request.id,
            version: request.version,
            title: request.title,
            description: request.description,
            category: request.category,
            locationApprox: request.locationApprox,
            desiredWindow: request.desiredWindow,
            urgency: request.urgency,
            budget: request.budget,
          },
          parties: {
            customerActorId: command.actor.id,
            professionalActorId: locked.professionalActorId,
            professionalProfileId: locked.professionalId,
          },
          proposal: {
            id: currentProposal.id,
            version: currentProposal.version,
            revision,
          },
          acceptance: {
            textVersion: DEMO_ACCEPTANCE_POLICY.version,
            text: DEMO_ACCEPTANCE_POLICY.text,
            textHash: DEMO_ACCEPTANCE_POLICY.textHash,
            acceptedAt: command.acceptedAt,
          },
        };
        const snapshotHash = digest(contractSnapshot);

        await executor.query(
          `
              INSERT INTO contracting.contracts (
                id,
                request_id,
                proposal_id,
                accepted_revision_id,
                customer_actor_id,
                professional_actor_id,
                professional_id,
                status,
                version,
                snapshot,
                snapshot_hash,
                acceptance_text_version,
                accepted_at,
                created_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                'AWAITING_PAYMENT', 1, $8, $9, $10, $11, $11
              )
            `,
          [
            command.contractId,
            locked.requestId,
            locked.id,
            command.revisionId,
            command.actor.id,
            locked.professionalActorId,
            locked.professionalId,
            contractSnapshot,
            snapshotHash,
            command.acceptanceTextVersion,
            command.acceptedAt,
          ],
        );

        await executor.query(
          `
              INSERT INTO scheduling.calendar_reservations (
                id,
                resource_id,
                contract_id,
                proposal_revision_id,
                kind,
                status,
                starts_at,
                ends_at,
                timezone,
                expires_at,
                created_at
              )
              VALUES (
                $1, $2, $3, $4, 'HOLD', 'HOLD_ACTIVE',
                $5, $6, $7, $8, $9
              )
            `,
          [
            command.bookingHoldId,
            resource.id,
            command.contractId,
            command.revisionId,
            revision.schedule.startsAt,
            revision.schedule.endsAt,
            revision.schedule.timezone,
            command.holdExpiresAt,
            command.acceptedAt,
          ],
        );

        await executor.query(
          `
              INSERT INTO payments.payment_orders (
                id,
                contract_id,
                purpose,
                sequence,
                status,
                amount_minor,
                currency,
                checkout_available,
                breakdown,
                created_at
              )
              VALUES (
                $1, $2, 'CONTRACT', 1, 'AWAITING_PAYMENT',
                $3, 'BRL', false, $4, $5
              )
            `,
          [
            command.paymentOrderId,
            command.contractId,
            revision.breakdown.customerTotalMinor,
            revision.breakdown,
            command.acceptedAt,
          ],
        );

        await executor.query(
          `
              UPDATE marketplace.proposals
              SET
                status = 'CONVERTED',
                accepted_revision_id = $2,
                converted_at = $3,
                version = version + 1,
                updated_at = now()
              WHERE id = $1
            `,
          [locked.id, command.revisionId, command.acceptedAt],
        );
        await executor.query(
          `
              UPDATE marketplace.proposals
              SET
                status = 'REJECTED',
                version = version + 1,
                updated_at = now()
              WHERE request_id = $1
                AND id <> $2
                AND status IN ('SENT', 'VIEWED', 'NEGOTIATING', 'REVISED')
            `,
          [locked.requestId, locked.id],
        );
        await executor.query(
          `
              UPDATE marketplace.service_requests
              SET
                status = 'CONVERTED',
                version = version + 1,
                updated_at = now()
              WHERE id = $1
                AND status = 'PUBLISHED'
            `,
          [locked.requestId],
        );

        const acceptance: ProposalAcceptance = {
          contract: {
            id: command.contractId,
            requestId: locked.requestId,
            proposalId: locked.id,
            acceptedRevisionId: command.revisionId,
            status: 'AWAITING_PAYMENT',
            version: 1,
            snapshotHash,
            acceptanceTextVersion: command.acceptanceTextVersion,
            acceptedAt: command.acceptedAt,
            snapshot: contractSnapshot,
          },
          paymentOrder: {
            id: command.paymentOrderId,
            contractId: command.contractId,
            status: 'AWAITING_PAYMENT',
            amount: {
              amountMinor: revision.breakdown.customerTotalMinor,
              currency: 'BRL',
            },
            checkoutAvailable: false,
            createdAt: command.acceptedAt,
          },
          bookingHold: {
            id: command.bookingHoldId,
            contractId: command.contractId,
            status: 'HOLD_ACTIVE',
            schedule: revision.schedule,
            expiresAt: command.holdExpiresAt,
            createdAt: command.acceptedAt,
          },
        };

        await this.recordAudit(executor, command, 'ProposalAccepted', 'Proposal', locked.id, {
          revisionId: command.revisionId,
          contractId: command.contractId,
          snapshotHash,
        });
        await this.recordAudit(
          executor,
          command,
          'ContractCreated',
          'Contract',
          command.contractId,
          {
            status: 'AWAITING_PAYMENT',
            paymentOrderId: command.paymentOrderId,
            bookingHoldId: command.bookingHoldId,
          },
        );
        const resultingProposalVersion = Number(locked.version) + 1;
        await this.recordEvent(
          executor,
          command,
          'ProposalAccepted',
          'Proposal',
          locked.id,
          resultingProposalVersion,
          {
            proposalId: locked.id,
            revisionId: command.revisionId,
            requestId: locked.requestId,
            contractId: command.contractId,
            paymentOrderId: command.paymentOrderId,
            bookingHoldId: command.bookingHoldId,
            customerActorId: command.actor.id,
            professionalActorId: locked.professionalActorId,
            acceptedAt: command.acceptedAt,
            snapshotHash,
          },
        );
        await this.recordEvent(
          executor,
          command,
          'ContractCreated',
          'Contract',
          command.contractId,
          1,
          {
            contractId: command.contractId,
            requestId: locked.requestId,
            proposalId: locked.id,
            status: 'AWAITING_PAYMENT',
          },
        );
        await this.recordEvent(
          executor,
          command,
          'PaymentOrderCreated',
          'PaymentOrder',
          command.paymentOrderId,
          1,
          {
            paymentOrderId: command.paymentOrderId,
            contractId: command.contractId,
            status: 'AWAITING_PAYMENT',
          },
        );
        await this.complete(executor, command, `proposal:${command.proposalId}:accept`, acceptance);
        return acceptance;
      }, 'SERIALIZABLE');
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.code === '40P01' || error.code === '40001') {
          throw new MarketplaceRepositoryError('TRANSACTION_RETRY_REQUIRED');
        }
        if (error.code === '23P01') {
          throw new MarketplaceRepositoryError('SLOT_UNAVAILABLE');
        }
        if (error.code === '23505') {
          throw new MarketplaceRepositoryError('PROPOSAL_ALREADY_ACCEPTED');
        }
      }
      throw error;
    }
  }

  async findContract(
    contractId: string,
    actor: DemoActor,
    correlationId: string,
  ): Promise<ContractView | null> {
    return this.database.transaction(async (executor) => {
      const authorized = await executor.query(
        `
          SELECT id
          FROM contracting.contracts
          WHERE id = $1
            AND (
              customer_actor_id = $2
              OR professional_actor_id = $2
            )
        `,
        [contractId, actor.id],
      );
      if (!authorized.rowCount) {
        return null;
      }

      await this.expireHolds(executor, correlationId, { contractId });
      const result = await executor.query<ContractRow>(
        `
          SELECT
            contract.id AS "contractId",
            contract.request_id AS "requestId",
            contract.proposal_id AS "proposalId",
            contract.accepted_revision_id AS "acceptedRevisionId",
            contract.status AS "contractStatus",
            contract.version AS "contractVersion",
            contract.snapshot,
            contract.snapshot_hash AS "snapshotHash",
            contract.acceptance_text_version AS "acceptanceTextVersion",
            contract.accepted_at AS "acceptedAt",
            payment.id AS "paymentOrderId",
            payment.status AS "paymentOrderStatus",
            payment.amount_minor AS "amountMinor",
            payment.currency,
            payment.checkout_available AS "checkoutAvailable",
            payment.created_at AS "paymentCreatedAt",
            hold.id AS "bookingHoldId",
            hold.status AS "holdStatus",
            hold.starts_at AS "holdStartsAt",
            hold.ends_at AS "holdEndsAt",
            hold.timezone AS "holdTimezone",
            hold.expires_at AS "holdExpiresAt",
            hold.created_at AS "holdCreatedAt"
          FROM contracting.contracts contract
          JOIN payments.payment_orders payment ON payment.contract_id = contract.id
          JOIN scheduling.calendar_reservations hold ON hold.contract_id = contract.id
          WHERE contract.id = $1
            AND (
              contract.customer_actor_id = $2
              OR contract.professional_actor_id = $2
            )
        `,
        [contractId, actor.id],
      );
      const row = result.rows[0];
      return row ? toContractView(row) : null;
    });
  }

  async runMaintenanceBatch(batchSize: number): Promise<MarketplaceMaintenanceResult> {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error('Marketplace maintenance batch size must be a positive integer');
    }

    return this.database.transaction(async (executor) => {
      const correlationId = uuidv7();
      const temporal = await this.expireTemporalMarketplaceState(
        executor,
        correlationId,
        batchSize,
      );
      const expiredHolds = await this.expireHolds(executor, correlationId, {}, batchSize);
      const deletedIdempotencyRecords = await this.deleteExpiredIdempotencyRecords(
        executor,
        batchSize,
      );
      return {
        ...temporal,
        expiredHolds,
        deletedIdempotencyRecords,
      };
    });
  }

  private async expireTemporalMarketplaceState(
    executor: QueryExecutor,
    correlationId: string,
    batchSize: number,
  ): Promise<Pick<MarketplaceMaintenanceResult, 'expiredServiceRequests' | 'expiredProposals'>> {
    const dueRequests = await executor.query<TemporalRequestRow>(
      `
        SELECT
          request.id,
          request.version,
          request.proposal_deadline <= now() AS "proposalDeadlineElapsed",
          request.desired_starts_at <= now() AS "desiredStartElapsed"
        FROM marketplace.service_requests request
        WHERE request.status = 'PUBLISHED'
          AND (
            request.proposal_deadline <= now()
            OR request.desired_starts_at <= now()
            OR EXISTS (
              SELECT 1
              FROM marketplace.proposals proposal
              JOIN marketplace.proposal_revisions revision
                ON revision.id = proposal.current_revision_id
                AND revision.proposal_id = proposal.id
              WHERE proposal.request_id = request.id
                AND proposal.status IN ('SENT', 'VIEWED', 'NEGOTIATING', 'REVISED')
                AND (
                  revision.valid_until <= now()
                  OR revision.scheduled_starts_at <= now()
                )
            )
          )
        ORDER BY request.proposal_deadline, request.id
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [batchSize],
    );

    let expiredServiceRequests = 0;
    let expiredProposals = 0;
    for (const request of dueRequests.rows) {
      const proposals = await executor.query<TemporalProposalRow>(
        `
          SELECT
            proposal.id,
            proposal.status,
            proposal.version,
            revision.valid_until <= now() AS "validityElapsed",
            revision.scheduled_starts_at <= now() AS "scheduleStartElapsed"
          FROM marketplace.proposals proposal
          LEFT JOIN marketplace.proposal_revisions revision
            ON revision.id = proposal.current_revision_id
            AND revision.proposal_id = proposal.id
          WHERE proposal.request_id = $1
          ORDER BY proposal.id
          FOR UPDATE OF proposal
        `,
        [request.id],
      );
      const requestExpired = request.proposalDeadlineElapsed || request.desiredStartElapsed;

      for (const proposal of proposals.rows) {
        if (!EDITABLE_PROPOSAL_STATUSES.includes(proposal.status)) continue;
        const reason = requestExpired
          ? 'REQUEST_EXPIRED'
          : proposal.validityElapsed
            ? 'VALIDITY_ELAPSED'
            : proposal.scheduleStartElapsed
              ? 'SCHEDULE_START_ELAPSED'
              : null;
        if (!reason) continue;

        const version = Number(proposal.version) + 1;
        const updated = await executor.query(
          `
            UPDATE marketplace.proposals
            SET
              status = 'EXPIRED',
              version = $2,
              updated_at = now()
            WHERE id = $1
              AND status IN ('SENT', 'VIEWED', 'NEGOTIATING', 'REVISED')
          `,
          [proposal.id, version],
        );
        if (!updated.rowCount) continue;

        expiredProposals += 1;
        await this.recordSystemTransition(executor, correlationId, {
          action: 'ProposalExpired',
          aggregateType: 'Proposal',
          aggregateId: proposal.id,
          aggregateVersion: version,
          metadata: {
            requestId: request.id,
            reason,
            status: 'EXPIRED',
            version,
          },
          payload: {
            proposalId: proposal.id,
            requestId: request.id,
            reason,
            status: 'EXPIRED',
          },
        });
      }

      if (!requestExpired) continue;
      const version = Number(request.version) + 1;
      const reason = request.proposalDeadlineElapsed
        ? 'PROPOSAL_DEADLINE_ELAPSED'
        : 'DESIRED_START_ELAPSED';
      const updated = await executor.query(
        `
          UPDATE marketplace.service_requests
          SET
            status = 'EXPIRED',
            version = $2,
            updated_at = now()
          WHERE id = $1
            AND status = 'PUBLISHED'
        `,
        [request.id, version],
      );
      if (!updated.rowCount) continue;

      expiredServiceRequests += 1;
      await this.recordSystemTransition(executor, correlationId, {
        action: 'RequestExpired',
        aggregateType: 'ServiceRequest',
        aggregateId: request.id,
        aggregateVersion: version,
        metadata: {
          reason,
          status: 'EXPIRED',
          version,
        },
        payload: {
          requestId: request.id,
          reason,
          status: 'EXPIRED',
        },
      });
    }

    return { expiredServiceRequests, expiredProposals };
  }

  private async expireHolds(
    executor: QueryExecutor,
    correlationId: string,
    filter: { resourceId?: string; contractId?: string },
    batchSize: number | null = null,
  ): Promise<number> {
    const expired = await executor.query<ExpiredHoldRow>(
      `
        WITH due AS (
          SELECT reservation.id
          FROM scheduling.calendar_reservations reservation
          WHERE reservation.status = 'HOLD_ACTIVE'
            AND reservation.expires_at <= now()
            AND ($1::uuid IS NULL OR reservation.resource_id = $1)
            AND ($2::uuid IS NULL OR reservation.contract_id = $2)
          ORDER BY reservation.expires_at, reservation.id
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        UPDATE scheduling.calendar_reservations reservation
        SET status = 'HOLD_EXPIRED'
        FROM due
        WHERE reservation.id = due.id
        RETURNING reservation.contract_id AS "contractId", reservation.id AS "holdId"
      `,
      [filter.resourceId ?? null, filter.contractId ?? null, batchSize],
    );

    for (const hold of expired.rows) {
      await executor.query(
        `
          UPDATE payments.payment_orders
          SET status = 'EXPIRED'
          WHERE contract_id = $1
            AND status = 'AWAITING_PAYMENT'
        `,
        [hold.contractId],
      );
      await executor.query(
        `
          UPDATE contracting.contracts
          SET status = 'CANCELLED', version = version + 1
          WHERE id = $1
            AND status = 'AWAITING_PAYMENT'
        `,
        [hold.contractId],
      );
      await executor.query(
        `
          INSERT INTO audit.audit_logs (
            id,
            actor_id,
            actor_role,
            action,
            resource_type,
            resource_id,
            correlation_id,
            after_digest,
            metadata
          )
          VALUES (
            $1,
            NULL,
            'SYSTEM',
            'BookingHoldExpired',
            'Contract',
            $2,
            $3,
            $4,
            $5
          )
        `,
        [
          uuidv7(),
          hold.contractId,
          correlationId,
          digest({ holdId: hold.holdId, status: 'HOLD_EXPIRED' }),
          { holdId: hold.holdId, status: 'HOLD_EXPIRED' },
        ],
      );
      await executor.query(
        `
          INSERT INTO platform.outbox_events (
            id,
            event_type,
            event_version,
            aggregate_type,
            aggregate_id,
            aggregate_version,
            correlation_id,
            payload,
            status,
            occurred_at
          )
          VALUES (
            $1, 'BookingHoldExpired', 1, 'Contract', $2, 2,
            $3, $4, 'PENDING', now()
          )
          ON CONFLICT DO NOTHING
        `,
        [
          uuidv7(),
          hold.contractId,
          correlationId,
          { contractId: hold.contractId, bookingHoldId: hold.holdId },
        ],
      );
    }
    return expired.rows.length;
  }

  private async deleteExpiredIdempotencyRecords(
    executor: QueryExecutor,
    batchSize: number,
  ): Promise<number> {
    const deleted = await executor.query(
      `
        WITH due AS (
          SELECT
            record.actor_id,
            record.operation,
            record.idempotency_key
          FROM platform.idempotency_records record
          WHERE record.expires_at <= now()
          ORDER BY record.expires_at, record.actor_id, record.operation, record.idempotency_key
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM platform.idempotency_records record
        USING due
        WHERE record.actor_id = due.actor_id
          AND record.operation = due.operation
          AND record.idempotency_key = due.idempotency_key
        RETURNING record.actor_id
      `,
      [batchSize],
    );
    return deleted.rowCount ?? 0;
  }

  private async recordSystemTransition(
    executor: QueryExecutor,
    correlationId: string,
    transition: {
      action: string;
      aggregateType: string;
      aggregateId: string;
      aggregateVersion: number;
      metadata: Record<string, unknown>;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await executor.query(
      `
        INSERT INTO audit.audit_logs (
          id,
          actor_id,
          actor_role,
          action,
          resource_type,
          resource_id,
          correlation_id,
          after_digest,
          metadata
        )
        VALUES ($1, NULL, 'SYSTEM', $2, $3, $4, $5, $6, $7)
      `,
      [
        uuidv7(),
        transition.action,
        transition.aggregateType,
        transition.aggregateId,
        correlationId,
        digest(transition.metadata),
        transition.metadata,
      ],
    );
    await executor.query(
      `
        INSERT INTO platform.outbox_events (
          id,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          aggregate_version,
          correlation_id,
          payload,
          status,
          occurred_at
        )
        VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'PENDING', now())
        ON CONFLICT DO NOTHING
      `,
      [
        uuidv7(),
        transition.action,
        transition.aggregateType,
        transition.aggregateId,
        transition.aggregateVersion,
        correlationId,
        transition.payload,
      ],
    );
  }

  private async lockRequestForProposal(
    executor: QueryExecutor,
    requestId: string,
    actor: DemoActor,
  ): Promise<LockedRequestRow> {
    if (actor.role !== 'PROFESSIONAL') {
      throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');
    }
    const result = await executor.query<LockedRequestRow>(
      `
        SELECT
          request.id,
          request.customer_actor_id AS "customerActorId",
          request.category_id AS "categoryId",
          request.status,
          request.version,
          request.proposal_deadline AS "proposalDeadline",
          request.desired_starts_at AS "desiredStartsAt",
          request.desired_ends_at AS "desiredEndsAt",
          request.desired_timezone AS "desiredTimezone"
        FROM marketplace.service_requests request
        JOIN marketplace.opportunity_recipients recipient
          ON recipient.request_id = request.id
        WHERE request.id = $1
          AND recipient.professional_id = $2
        FOR UPDATE
      `,
      [requestId, actor.professionalId],
    );
    const request = result.rows[0];
    if (!request) throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');
    if (request.status !== 'PUBLISHED' || request.proposalDeadline.getTime() <= Date.now()) {
      throw new MarketplaceRepositoryError('REQUEST_NOT_PUBLISHED');
    }

    if (!(await hasCurrentPrivateMatchEligibility(executor, request.id, actor.professionalId))) {
      throw new MarketplaceRepositoryError('PROFESSIONAL_NOT_ELIGIBLE');
    }
    return request;
  }

  private async lockProposal(
    executor: QueryExecutor,
    proposalId: string,
  ): Promise<LockedProposalRow | null> {
    const requestResult = await executor.query<QueryResultRow & { id: string }>(
      `
        SELECT request.id
        FROM marketplace.service_requests request
        WHERE request.id = (
          SELECT proposal.request_id
          FROM marketplace.proposals proposal
          WHERE proposal.id = $1
        )
        FOR UPDATE
      `,
      [proposalId],
    );
    const requestId = requestResult.rows[0]?.id;
    if (!requestId) return null;

    // Every proposal operation acquires the aggregate root first, then siblings
    // in one stable order. This prevents inverse sibling locks during acceptance.
    await executor.query(
      `
        SELECT proposal.id
        FROM marketplace.proposals proposal
        WHERE proposal.request_id = $1
        ORDER BY proposal.id
        FOR UPDATE
      `,
      [requestId],
    );

    const result = await executor.query<LockedProposalRow>(
      `
        SELECT
          proposal.id,
          proposal.request_id AS "requestId",
          proposal.professional_id AS "professionalId",
          professional_actor.id AS "professionalActorId",
          proposal.status,
          proposal.version,
          proposal.current_revision_id AS "currentRevisionId",
          request.customer_actor_id AS "customerActorId",
          request.status AS "requestStatus",
          request.category_id AS "categoryId",
          request.proposal_deadline AS "proposalDeadline",
          request.desired_starts_at AS "desiredStartsAt",
          request.desired_ends_at AS "desiredEndsAt",
          request.desired_timezone AS "desiredTimezone"
        FROM marketplace.proposals proposal
        JOIN marketplace.service_requests request ON request.id = proposal.request_id
        JOIN identity.demo_actors professional_actor
          ON professional_actor.professional_id = proposal.professional_id
          AND professional_actor.role = 'PROFESSIONAL'
          AND professional_actor.status = 'ACTIVE'
        WHERE proposal.id = $1
      `,
      [proposalId],
    );
    return result.rows[0] ?? null;
  }

  private validateRevisionAgainstRequest(
    request: Pick<
      LockedRequestRow,
      'proposalDeadline' | 'desiredStartsAt' | 'desiredEndsAt' | 'desiredTimezone'
    >,
    revision: PreparedProposalRevision,
  ): void {
    const validUntil = Date.parse(revision.input.validUntil);
    if (validUntil <= Date.now() || validUntil > request.proposalDeadline.getTime()) {
      throw new MarketplaceRepositoryError('PROPOSAL_EXPIRED');
    }
    this.validateSchedule(
      revision.input.schedule.startsAt,
      revision.input.schedule.endsAt,
      revision.input.schedule.timezone,
      request,
    );
  }

  private validateSchedule(
    startsAt: string,
    endsAt: string,
    timezone: string,
    request: Pick<LockedRequestRow, 'desiredStartsAt' | 'desiredEndsAt' | 'desiredTimezone'>,
  ): void {
    const starts = Date.parse(startsAt);
    const ends = Date.parse(endsAt);
    if (
      starts < request.desiredStartsAt.getTime() ||
      ends > request.desiredEndsAt.getTime() ||
      ends <= starts ||
      timezone !== request.desiredTimezone
    ) {
      throw new MarketplaceRepositoryError('SCHEDULE_OUTSIDE_REQUEST');
    }
  }

  private async insertRevision(
    executor: QueryExecutor,
    proposalId: string,
    revisionId: string,
    version: number,
    revision: PreparedProposalRevision,
  ): Promise<void> {
    await executor.query(
      `
        INSERT INTO marketplace.proposal_revisions (
          id,
          proposal_id,
          version,
          scope,
          included,
          excluded,
          labor_minor,
          materials_minor,
          travel_minor,
          customer_platform_fee_minor,
          professional_commission_minor,
          customer_total_minor,
          professional_net_estimate_minor,
          currency,
          commercial_policy_code,
          commercial_policy_version,
          commercial_policy_development_only,
          scheduled_starts_at,
          scheduled_ends_at,
          scheduled_timezone,
          valid_until,
          cancellation_policy_code,
          cancellation_policy_version,
          cancellation_policy_label,
          guarantee_offer,
          snapshot_hash
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, 'BRL',
          $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23, $24, $25
        )
      `,
      [
        revisionId,
        proposalId,
        version,
        revision.input.scope.trim(),
        revision.input.included.map((item) => item.trim()),
        revision.input.excluded.map((item) => item.trim()),
        revision.breakdown.laborMinor,
        revision.breakdown.materialsMinor,
        revision.breakdown.travelMinor,
        revision.breakdown.customerPlatformFeeMinor,
        revision.breakdown.professionalCommissionMinor,
        revision.breakdown.customerTotalMinor,
        revision.breakdown.professionalNetEstimateMinor,
        revision.breakdown.policy.code,
        revision.breakdown.policy.version,
        revision.breakdown.policy.developmentOnly,
        revision.input.schedule.startsAt,
        revision.input.schedule.endsAt,
        revision.input.schedule.timezone,
        revision.input.validUntil,
        CANCELLATION_POLICY.code,
        CANCELLATION_POLICY.version,
        CANCELLATION_POLICY.label,
        revision.input.guaranteeOffer,
        revision.snapshotHash,
      ],
    );
  }

  private async loadRequest(
    executor: QueryExecutor,
    id: string,
    sanitized: boolean,
  ): Promise<ServiceRequest | null> {
    const select = sanitized
      ? REQUEST_SELECT.replace('request.title,', 'request.sanitized_title AS title,').replace(
          'request.description,',
          'request.sanitized_description AS description,',
        )
      : REQUEST_SELECT;
    const result = await executor.query<RequestRow>(`${select} WHERE request.id = $1`, [id]);
    const row = result.rows[0];
    return row ? toRequest(row) : null;
  }

  private async loadProposal(executor: QueryExecutor, id: string): Promise<Proposal | null> {
    const result = await executor.query<ProposalRow>(`${PROPOSAL_SELECT} WHERE proposal.id = $1`, [
      id,
    ]);
    const row = result.rows[0];
    return row ? toProposal(row) : null;
  }

  private async claim<T>(
    executor: QueryExecutor,
    context: CommandContext,
    operation: string,
  ): Promise<T | null> {
    const inserted = await executor.query(
      `
        INSERT INTO platform.idempotency_records (
          actor_id, operation, idempotency_key, request_hash, status, expires_at
        )
        VALUES (
          $1, $2, $3, $4, 'IN_PROGRESS',
          now() + ($5::integer * interval '1 second')
        )
        ON CONFLICT (actor_id, operation, idempotency_key) DO UPDATE
        SET
          request_hash = EXCLUDED.request_hash,
          status = 'IN_PROGRESS',
          response_payload = NULL,
          created_at = now(),
          completed_at = NULL,
          expires_at = EXCLUDED.expires_at
        WHERE platform.idempotency_records.expires_at <= now()
        RETURNING actor_id
      `,
      [
        context.actor.id,
        operation,
        context.idempotencyKey,
        context.requestHash,
        IDEMPOTENCY_RETENTION_SECONDS,
      ],
    );
    if (inserted.rowCount) {
      return null;
    }

    const existing = await executor.query<IdempotencyRow>(
      `
        SELECT
          request_hash AS "requestHash",
          status,
          response_payload AS "responsePayload"
        FROM platform.idempotency_records
        WHERE actor_id = $1
          AND operation = $2
          AND idempotency_key = $3
        FOR UPDATE
      `,
      [context.actor.id, operation, context.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row || row.requestHash !== context.requestHash) {
      throw new MarketplaceRepositoryError('IDEMPOTENCY_KEY_REUSED');
    }
    if (row.status !== 'COMPLETED' || row.responsePayload === null) {
      throw new MarketplaceRepositoryError('IDEMPOTENCY_KEY_REUSED');
    }
    return row.responsePayload as T;
  }

  private async complete(
    executor: QueryExecutor,
    context: CommandContext,
    operation: string,
    response: unknown,
  ): Promise<void> {
    await executor.query(
      `
        UPDATE platform.idempotency_records
        SET
          status = 'COMPLETED',
          response_payload = $4,
          completed_at = now(),
          expires_at = now() + ($5::integer * interval '1 second')
        WHERE actor_id = $1
          AND operation = $2
          AND idempotency_key = $3
          AND status = 'IN_PROGRESS'
      `,
      [
        context.actor.id,
        operation,
        context.idempotencyKey,
        response,
        IDEMPOTENCY_RETENTION_SECONDS,
      ],
    );
  }

  private async recordAudit(
    executor: QueryExecutor,
    context: CommandContext,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await executor.query(
      `
        INSERT INTO audit.audit_logs (
          id,
          actor_id,
          actor_role,
          action,
          resource_type,
          resource_id,
          correlation_id,
          idempotency_key,
          after_digest,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        this.newId(),
        context.actor.id,
        context.actor.role,
        action,
        resourceType,
        resourceId,
        context.correlationId,
        context.idempotencyKey,
        digest(metadata),
        metadata,
      ],
    );
  }

  private async recordEvent(
    executor: QueryExecutor,
    context: CommandContext,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date().toISOString();
    await executor.query(
      `
        INSERT INTO platform.outbox_events (
          id,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          aggregate_version,
          correlation_id,
          payload,
          status,
          occurred_at
        )
        VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'PENDING', $8)
      `,
      [
        this.newId(),
        eventType,
        aggregateType,
        aggregateId,
        aggregateVersion,
        context.correlationId,
        payload,
        occurredAt,
      ],
    );
  }

  private newId(): string {
    return uuidv7();
  }
}
