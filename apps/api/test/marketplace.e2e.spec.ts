import {
  DEMO_ACCEPTANCE_POLICY,
  type BookingHold,
  type CategorySummary,
  type Contract,
  type DemoActor,
  type PaymentOrder,
  type Proposal,
  type ProposalAcceptance,
  type ProposalRevision,
  type ServiceRequest,
} from '@marido/contracts';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { CatalogRepository } from '../src/catalog/catalog.repository';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import { IdentityContextRepository } from '../src/identity/identity-context.repository';
import {
  MarketplaceRepository,
  MarketplaceRepositoryError,
  type AcceptProposalCommand,
  type ContractView,
  type CreateProposalCommand,
  type CreateRequestCommand,
  type PublishRequestCommand,
  type ReviseProposalCommand,
} from '../src/marketplace/marketplace.repository';

const CLIENT_ID = '019b0000-0000-7000-8000-000000000401';
const PROFESSIONAL_ACTOR_ID = '019b0000-0000-7000-8000-000000000402';
const OTHER_CLIENT_ID = '019b0000-0000-7000-8000-000000000403';
const PROFESSIONAL_ID = '019b0000-0000-7000-8000-000000000102';
const CATEGORY_ID = '019b0000-0000-7000-8000-000000000004';

const actors: DemoActor[] = [
  {
    id: CLIENT_ID,
    role: 'CLIENT',
    displayName: 'Marina Souza',
    professionalId: null,
  },
  {
    id: PROFESSIONAL_ACTOR_ID,
    role: 'PROFESSIONAL',
    displayName: 'Casa em Ordem',
    professionalId: PROFESSIONAL_ID,
  },
  {
    id: OTHER_CLIENT_ID,
    role: 'CLIENT',
    displayName: 'Rafael Nunes',
    professionalId: null,
  },
];

class IdentityRepositoryStub extends IdentityContextRepository {
  findActiveActor(id: string): Promise<DemoActor | null> {
    return Promise.resolve(actors.find((actor) => actor.id === id) ?? null);
  }

  listActiveActors(): Promise<DemoActor[]> {
    return Promise.resolve(actors);
  }
}

class EmptyCatalogRepositoryStub extends CatalogRepository {
  listCategories(): Promise<CategorySummary[]> {
    return Promise.resolve([]);
  }

  searchProfessionals(): Promise<{ items: []; total: 0 }> {
    return Promise.resolve({ items: [], total: 0 });
  }

  findProfessionalBySlug(): Promise<null> {
    return Promise.resolve(null);
  }
}

class MarketplaceRepositoryStub extends MarketplaceRepository {
  private serviceRequest: ServiceRequest | null = null;
  private proposal: Proposal | null = null;
  private revisions: ProposalRevision[] = [];
  private acceptance: ProposalAcceptance | null = null;
  private readonly acceptanceByKey = new Map<
    string,
    { requestHash: string; response: ProposalAcceptance }
  >();

  createRequest(command: CreateRequestCommand): Promise<ServiceRequest> {
    const now = new Date().toISOString();
    this.serviceRequest = {
      id: command.id,
      title: command.input.title,
      description: command.input.description,
      category: {
        id: command.input.categoryId,
        slug: 'montagem-de-moveis',
        name: 'Montagem de móveis',
      },
      locationApprox: command.input.locationApprox,
      desiredWindow: command.input.desiredWindow,
      urgency: command.input.urgency,
      budget: command.input.budget ?? null,
      visibility: 'PRIVATE_MATCHED',
      status: 'DRAFT',
      version: 1,
      proposalDeadline: command.input.proposalDeadline,
      proposalCount: 0,
      createdAt: now,
      publishedAt: null,
    };
    return Promise.resolve(this.serviceRequest);
  }

  publishRequest(command: PublishRequestCommand): Promise<ServiceRequest> {
    if (
      !this.serviceRequest ||
      this.serviceRequest.id !== command.requestId ||
      this.serviceRequest.status !== 'DRAFT'
    ) {
      throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');
    }
    if (this.serviceRequest.version !== command.expectedVersion) {
      throw new MarketplaceRepositoryError('REQUEST_VERSION_CONFLICT');
    }
    this.serviceRequest = {
      ...this.serviceRequest,
      status: 'PUBLISHED',
      version: 2,
      publishedAt: new Date().toISOString(),
    };
    return Promise.resolve(this.serviceRequest);
  }

  listOwnRequests(actorId: string): Promise<ServiceRequest[]> {
    return Promise.resolve(
      this.serviceRequest && actorId === CLIENT_ID ? [this.serviceRequest] : [],
    );
  }

  listOpportunities(): Promise<ServiceRequest[]> {
    return Promise.resolve(this.serviceRequest ? [this.serviceRequest] : []);
  }

  findRequest(requestId: string, actor: DemoActor): Promise<ServiceRequest | null> {
    if (!this.serviceRequest || this.serviceRequest.id !== requestId) {
      return Promise.resolve(null);
    }
    if (actor.role === 'CLIENT' && actor.id !== CLIENT_ID) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.serviceRequest);
  }

  createProposal(command: CreateProposalCommand): Promise<Proposal> {
    if (!this.serviceRequest || this.serviceRequest.status !== 'PUBLISHED') {
      throw new MarketplaceRepositoryError('REQUEST_NOT_PUBLISHED');
    }
    const revision = this.toRevision(command.revisionId, 1, command.revision);
    this.revisions = [revision];
    this.proposal = {
      id: command.proposalId,
      requestId: command.requestId,
      professional: {
        id: PROFESSIONAL_ID,
        slug: 'casa-em-ordem-montagens',
        displayName: 'Casa em Ordem',
      },
      status: 'SENT',
      version: 1,
      currentRevision: revision,
      createdAt: revision.createdAt,
      updatedAt: revision.createdAt,
    };
    this.serviceRequest = { ...this.serviceRequest, proposalCount: 1 };
    return Promise.resolve(this.proposal);
  }

  reviseProposal(command: ReviseProposalCommand): Promise<Proposal> {
    if (!this.proposal || this.proposal.id !== command.proposalId) {
      throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
    }
    if (this.proposal.version !== command.expectedVersion) {
      throw new MarketplaceRepositoryError('PROPOSAL_VERSION_CONFLICT');
    }
    const version = this.proposal.version + 1;
    const revision = this.toRevision(command.revisionId, version, command.revision);
    this.revisions.push(revision);
    this.proposal = {
      ...this.proposal,
      status: 'REVISED',
      version,
      currentRevision: revision,
      updatedAt: revision.createdAt,
    };
    return Promise.resolve(this.proposal);
  }

  listProposals(requestId: string, actor: DemoActor): Promise<Proposal[]> {
    if (
      !this.serviceRequest ||
      this.serviceRequest.id !== requestId ||
      (actor.role === 'CLIENT' && actor.id !== CLIENT_ID)
    ) {
      throw new MarketplaceRepositoryError('REQUEST_NOT_FOUND');
    }
    return Promise.resolve(this.proposal ? [this.proposal] : []);
  }

  listProposalRevisions(proposalId: string, actor: DemoActor): Promise<ProposalRevision[]> {
    if (
      !this.proposal ||
      this.proposal.id !== proposalId ||
      (actor.role === 'CLIENT' && actor.id !== CLIENT_ID)
    ) {
      throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
    }
    return Promise.resolve(this.revisions);
  }

  async acceptProposal(command: AcceptProposalCommand): Promise<ProposalAcceptance> {
    const replay = this.acceptanceByKey.get(command.idempotencyKey);
    if (replay) {
      if (replay.requestHash !== command.requestHash) {
        throw new MarketplaceRepositoryError('IDEMPOTENCY_KEY_REUSED');
      }
      return replay.response;
    }

    await Promise.resolve();
    if (!this.proposal || this.proposal.id !== command.proposalId) {
      throw new MarketplaceRepositoryError('PROPOSAL_NOT_FOUND');
    }
    if (this.acceptance) {
      throw new MarketplaceRepositoryError('PROPOSAL_ALREADY_ACCEPTED');
    }
    if (this.proposal.version !== command.expectedVersion) {
      throw new MarketplaceRepositoryError('PROPOSAL_VERSION_CONFLICT');
    }
    if (this.proposal.currentRevision.id !== command.revisionId) {
      throw new MarketplaceRepositoryError('PROPOSAL_REVISION_STALE');
    }

    const contract: Contract = {
      id: command.contractId,
      requestId: this.serviceRequest!.id,
      proposalId: this.proposal.id,
      acceptedRevisionId: command.revisionId,
      status: 'AWAITING_PAYMENT',
      version: 1,
      snapshotHash: 'a'.repeat(64),
      acceptanceTextVersion: command.acceptanceTextVersion,
      acceptedAt: command.acceptedAt,
      snapshot: {
        request: {
          id: this.serviceRequest!.id,
          version: this.serviceRequest!.version,
          title: this.serviceRequest!.title,
          description: this.serviceRequest!.description,
          category: this.serviceRequest!.category,
          locationApprox: this.serviceRequest!.locationApprox,
          desiredWindow: this.serviceRequest!.desiredWindow,
          urgency: this.serviceRequest!.urgency,
          budget: this.serviceRequest!.budget,
        },
        parties: {
          customerActorId: CLIENT_ID,
          professionalActorId: PROFESSIONAL_ACTOR_ID,
          professionalProfileId: PROFESSIONAL_ID,
        },
        proposal: {
          id: this.proposal.id,
          version: this.proposal.version,
          revision: this.proposal.currentRevision,
        },
        acceptance: {
          textVersion: DEMO_ACCEPTANCE_POLICY.version,
          text: DEMO_ACCEPTANCE_POLICY.text,
          textHash: DEMO_ACCEPTANCE_POLICY.textHash,
          acceptedAt: command.acceptedAt,
        },
      },
    };
    const paymentOrder: PaymentOrder = {
      id: command.paymentOrderId,
      contractId: contract.id,
      status: 'AWAITING_PAYMENT',
      amount: {
        amountMinor: this.proposal.currentRevision.breakdown.customerTotalMinor,
        currency: 'BRL',
      },
      checkoutAvailable: false,
      createdAt: command.acceptedAt,
    };
    const bookingHold: BookingHold = {
      id: command.bookingHoldId,
      contractId: contract.id,
      status: 'HOLD_ACTIVE',
      schedule: this.proposal.currentRevision.schedule,
      expiresAt: command.holdExpiresAt,
      createdAt: command.acceptedAt,
    };

    this.proposal = { ...this.proposal, status: 'CONVERTED', version: this.proposal.version + 1 };
    this.acceptance = { contract, paymentOrder, bookingHold };
    this.acceptanceByKey.set(command.idempotencyKey, {
      requestHash: command.requestHash,
      response: this.acceptance,
    });
    return this.acceptance;
  }

  findContract(contractId: string, actor: DemoActor): Promise<ContractView | null> {
    if (
      !this.acceptance ||
      this.acceptance.contract.id !== contractId ||
      ![CLIENT_ID, PROFESSIONAL_ACTOR_ID].includes(actor.id)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.acceptance);
  }

  private toRevision(
    id: string,
    version: number,
    prepared: CreateProposalCommand['revision'],
  ): ProposalRevision {
    return {
      id,
      version,
      scope: prepared.input.scope,
      included: prepared.input.included,
      excluded: prepared.input.excluded,
      breakdown: prepared.breakdown,
      schedule: prepared.input.schedule,
      validUntil: prepared.input.validUntil,
      policies: {
        cancellation: {
          code: 'DEMO_CANCELLATION_NO_CHARGE',
          version: 1,
          label: 'Demonstração sem cobrança: cancelamentos não geram taxa.',
        },
        guarantee: prepared.input.guaranteeOffer
          ? {
              offeredBy: 'PROFESSIONAL',
              text: prepared.input.guaranteeOffer,
            }
          : null,
      },
      createdAt: new Date().toISOString(),
    };
  }
}

function futureInput() {
  const now = Date.now();
  const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();
  return {
    request: {
      categoryId: CATEGORY_ID,
      title: 'Montagem de guarda-roupa de três portas',
      description: 'Preciso montar um guarda-roupa novo, ainda embalado, no quarto.',
      locationApprox: {
        city: 'Salvador',
        state: 'BA',
        district: 'Pituba',
      },
      desiredWindow: {
        startsAt: iso(10),
        endsAt: iso(11),
        timezone: 'America/Bahia',
      },
      urgency: 'WITHIN_7_DAYS',
      budget: {
        minMinor: 15000,
        maxMinor: 30000,
        currency: 'BRL',
      },
      visibility: 'PRIVATE_MATCHED',
      proposalDeadline: iso(5),
    },
    proposal: {
      scope: 'Montagem completa do móvel conforme o manual do fabricante.',
      included: ['Montagem', 'Conferência das portas'],
      excluded: ['Fixação estrutural na parede'],
      amounts: {
        laborMinor: 18000,
        materialsMinor: 0,
        travelMinor: 2000,
        currency: 'BRL',
      },
      schedule: {
        startsAt: iso(10),
        endsAt: new Date(now + 10 * 86_400_000 + 3_600_000).toISOString(),
        timezone: 'America/Bahia',
      },
      validUntil: iso(4),
      guaranteeOffer: 'Ajustes de montagem por até trinta dias.',
    },
  } as const;
}

describe('private marketplace workflow API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://unused';
    process.env.NODE_ENV = 'test';
    process.env.DEMO_MODE = 'true';

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IdentityContextRepository)
      .useClass(IdentityRepositoryStub)
      .overrideProvider(MarketplaceRepository)
      .useClass(MarketplaceRepositoryStub)
      .overrideProvider(CatalogRepository)
      .useClass(EmptyCatalogRepositoryStub)
      .overrideProvider(DatabaseService)
      .useValue({
        isReady: () => Promise.resolve(true),
        onApplicationShutdown: () => undefined,
      })
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('fails closed without a demonstrative actor and rejects a role escalation', async () => {
    const input = futureInput();
    await request(app.getHttpServer())
      .post('/api/v1/service-requests')
      .set('Idempotency-Key', 'request-without-actor-0001')
      .send(input.request)
      .expect(401);

    const response = await request(app.getHttpServer())
      .post('/api/v1/service-requests')
      .set('X-Demo-Actor-Id', PROFESSIONAL_ACTOR_ID)
      .set('Idempotency-Key', 'request-role-escalation-01')
      .send(input.request)
      .expect(403);

    expect(response.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('returns a neutral 404 when another client requests private details', async () => {
    const input = futureInput();
    const created = await request(app.getHttpServer())
      .post('/api/v1/service-requests')
      .set('X-Demo-Actor-Id', CLIENT_ID)
      .set('Idempotency-Key', 'private-request-create-001')
      .send(input.request)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/service-requests/${created.body.data.id}`)
      .set('X-Demo-Actor-Id', OTHER_CLIENT_ID)
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/service-requests/not-a-uuid')
      .set('X-Demo-Actor-Id', CLIENT_ID)
      .expect(400);
  });

  it('keeps prior proposal revisions and rejects an obsolete aggregate version', async () => {
    const prepared = await preparePublishedProposal(app);
    const input = futureInput();

    const revised = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${prepared.proposalId}/revisions`)
      .set('X-Demo-Actor-Id', PROFESSIONAL_ACTOR_ID)
      .set('Idempotency-Key', 'proposal-first-revision-001')
      .set('If-Match', '"1"')
      .send({
        ...input.proposal,
        scope: 'Montagem completa, conferência e regulagem final das portas.',
      })
      .expect(201);

    expect(revised.headers.etag).toBe('"2"');
    const stale = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${prepared.proposalId}/revisions`)
      .set('X-Demo-Actor-Id', PROFESSIONAL_ACTOR_ID)
      .set('Idempotency-Key', 'proposal-stale-revision-01')
      .set('If-Match', '"1"')
      .send(input.proposal)
      .expect(409);

    expect(stale.body.error.code).toBe('PROPOSAL_VERSION_CONFLICT');
    const history = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${prepared.proposalId}/revisions`)
      .set('X-Demo-Actor-Id', PROFESSIONAL_ACTOR_ID)
      .expect(200);
    expect(history.body.data.map((revision: ProposalRevision) => revision.version)).toEqual([1, 2]);
  });

  it('replays the same acceptance key without creating another contract', async () => {
    const prepared = await preparePublishedProposal(app);
    const accept = {
      revisionId: prepared.revisionId,
      acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
    };
    const first = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${prepared.proposalId}/accept`)
      .set('X-Demo-Actor-Id', CLIENT_ID)
      .set('Idempotency-Key', 'acceptance-idempotency-0001')
      .set('If-Match', '"1"')
      .send(accept)
      .expect(200);
    const reused = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${prepared.proposalId}/accept`)
      .set('X-Demo-Actor-Id', CLIENT_ID)
      .set('Idempotency-Key', 'acceptance-idempotency-0001')
      .set('If-Match', '"1"')
      .send({
        ...accept,
        revisionId: '019b0000-0000-7000-8000-000000000999',
      })
      .expect(409);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${prepared.proposalId}/accept`)
      .set('X-Demo-Actor-Id', CLIENT_ID)
      .set('Idempotency-Key', 'acceptance-idempotency-0001')
      .set('If-Match', '"1"')
      .send(accept)
      .expect(200);

    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(replay.body.data).toEqual(first.body.data);
    expect(first.body.data).toMatchObject({
      contract: { status: 'AWAITING_PAYMENT' },
      paymentOrder: { status: 'AWAITING_PAYMENT', checkoutAvailable: false },
      bookingHold: { status: 'HOLD_ACTIVE' },
    });
  });

  it('rejects acceptance of an obsolete revision at the current proposal version', async () => {
    const prepared = await preparePublishedProposal(app);
    const response = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${prepared.proposalId}/accept`)
      .set('X-Demo-Actor-Id', CLIENT_ID)
      .set('Idempotency-Key', 'acceptance-stale-revision-01')
      .set('If-Match', '"1"')
      .send({
        revisionId: '019b0000-0000-7000-8000-000000000999',
        acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
      })
      .expect(409);

    expect(response.body.error.code).toBe('PROPOSAL_REVISION_STALE');
  });

  it('allows only one winner when two distinct acceptance commands race', async () => {
    const prepared = await preparePublishedProposal(app);
    const body = {
      revisionId: prepared.revisionId,
      acceptanceTextVersion: 'DEMO-CONTRACT-PTBR-1',
    };
    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/proposals/${prepared.proposalId}/accept`)
        .set('X-Demo-Actor-Id', CLIENT_ID)
        .set('Idempotency-Key', 'acceptance-race-command-0001')
        .set('If-Match', '"1"')
        .send(body),
      request(app.getHttpServer())
        .post(`/api/v1/proposals/${prepared.proposalId}/accept`)
        .set('X-Demo-Actor-Id', CLIENT_ID)
        .set('Idempotency-Key', 'acceptance-race-command-0002')
        .set('If-Match', '"1"')
        .send(body),
    ]);

    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});

async function preparePublishedProposal(
  app: INestApplication,
): Promise<{ proposalId: string; revisionId: string }> {
  const input = futureInput();
  const created = await request(app.getHttpServer())
    .post('/api/v1/service-requests')
    .set('X-Demo-Actor-Id', CLIENT_ID)
    .set('Idempotency-Key', 'prepare-request-create-001')
    .send(input.request)
    .expect(201);
  const requestId = created.body.data.id as string;

  await request(app.getHttpServer())
    .post(`/api/v1/service-requests/${requestId}/publish`)
    .set('X-Demo-Actor-Id', CLIENT_ID)
    .set('Idempotency-Key', 'prepare-request-publish-01')
    .set('If-Match', '"1"')
    .expect(200);

  const proposal = await request(app.getHttpServer())
    .post(`/api/v1/service-requests/${requestId}/proposals`)
    .set('X-Demo-Actor-Id', PROFESSIONAL_ACTOR_ID)
    .set('Idempotency-Key', 'prepare-proposal-create-01')
    .send(input.proposal)
    .expect(201);

  return {
    proposalId: proposal.body.data.id as string,
    revisionId: proposal.body.data.currentRevision.id as string,
  };
}
