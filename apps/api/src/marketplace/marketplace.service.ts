import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  acceptProposalInputSchema,
  createServiceRequestInputSchema,
  proposalRevisionInputSchema,
  type DemoActor,
  type Proposal,
  type ProposalAcceptance,
  type ProposalRevision,
  type ServiceRequest,
} from '@marido/contracts';
import { uuidv7 } from 'uuidv7';

import { digest, sanitizeOpportunityText } from './marketplace-integrity';
import {
  MarketplaceRepository,
  MarketplaceRepositoryError,
  type MarketplaceErrorCode,
  type PreparedProposalRevision,
} from './marketplace.repository';
import {
  ACCEPTANCE_TEXT_VERSION,
  calculateBreakdown,
  CANCELLATION_POLICY,
  HOLD_DURATION_MINUTES,
} from './marketplace-policy';

interface CommandMetadata {
  idempotencyKey: string;
  correlationId: string;
}

interface VersionedCommandMetadata extends CommandMetadata {
  expectedVersion: number;
}

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly config: ConfigService,
    private readonly repository: MarketplaceRepository,
  ) {}

  async createRequest(
    actor: DemoActor,
    body: unknown,
    metadata: CommandMetadata,
  ): Promise<ServiceRequest> {
    this.ensureDemoMode();
    this.requireRole(actor, 'CLIENT');
    const input = this.parse(createServiceRequestInputSchema, body);
    this.validateTimezone(input.desiredWindow.timezone);
    if (
      Date.parse(input.proposalDeadline) <= Date.now() ||
      Date.parse(input.desiredWindow.startsAt) <= Date.now()
    ) {
      throw new UnprocessableEntityException({
        code: 'REQUEST_WINDOW_IN_PAST',
        message: 'O prazo e a janela desejada precisam estar no futuro.',
      });
    }

    return this.execute(() =>
      this.repository.createRequest({
        actor,
        id: uuidv7(),
        input,
        sanitizedTitle: sanitizeOpportunityText(input.title),
        sanitizedDescription: sanitizeOpportunityText(input.description),
        correlationId: metadata.correlationId,
        idempotencyKey: metadata.idempotencyKey,
        requestHash: digest({ operation: 'create-request', input }),
      }),
    );
  }

  async publishRequest(
    actor: DemoActor,
    requestId: string,
    metadata: VersionedCommandMetadata,
  ): Promise<ServiceRequest> {
    this.ensureDemoMode();
    this.requireRole(actor, 'CLIENT');
    return this.execute(() =>
      this.repository.publishRequest({
        actor,
        requestId,
        expectedVersion: metadata.expectedVersion,
        correlationId: metadata.correlationId,
        idempotencyKey: metadata.idempotencyKey,
        requestHash: digest({
          operation: 'publish-request',
          requestId,
          expectedVersion: metadata.expectedVersion,
        }),
      }),
    );
  }

  listRequests(actor: DemoActor, scope: 'mine' | 'opportunities'): Promise<ServiceRequest[]> {
    this.ensureDemoMode();
    if (scope === 'mine') {
      this.requireRole(actor, 'CLIENT');
      return this.repository.listOwnRequests(actor.id);
    }
    const professional = this.requireProfessional(actor);
    return this.repository.listOpportunities(professional.professionalId);
  }

  async getRequest(actor: DemoActor, requestId: string): Promise<ServiceRequest> {
    this.ensureDemoMode();
    const request = await this.repository.findRequest(requestId, actor);
    if (!request) {
      throw this.notFound('REQUEST_NOT_FOUND', 'Este pedido não está disponível.');
    }
    return request;
  }

  createProposal(
    actor: DemoActor,
    requestId: string,
    body: unknown,
    metadata: CommandMetadata,
  ): Promise<Proposal> {
    this.ensureDemoMode();
    this.requireRole(actor, 'PROFESSIONAL');
    const revision = this.prepareRevision(body);
    return this.execute(() =>
      this.repository.createProposal({
        actor,
        proposalId: uuidv7(),
        revisionId: uuidv7(),
        requestId,
        revision,
        correlationId: metadata.correlationId,
        idempotencyKey: metadata.idempotencyKey,
        requestHash: digest({ operation: 'create-proposal', requestId, input: revision.input }),
      }),
    );
  }

  reviseProposal(
    actor: DemoActor,
    proposalId: string,
    body: unknown,
    metadata: VersionedCommandMetadata,
  ): Promise<Proposal> {
    this.ensureDemoMode();
    this.requireRole(actor, 'PROFESSIONAL');
    const revision = this.prepareRevision(body);
    return this.execute(() =>
      this.repository.reviseProposal({
        actor,
        proposalId,
        revisionId: uuidv7(),
        expectedVersion: metadata.expectedVersion,
        revision,
        correlationId: metadata.correlationId,
        idempotencyKey: metadata.idempotencyKey,
        requestHash: digest({
          operation: 'revise-proposal',
          proposalId,
          expectedVersion: metadata.expectedVersion,
          input: revision.input,
        }),
      }),
    );
  }

  listProposals(actor: DemoActor, requestId: string): Promise<Proposal[]> {
    this.ensureDemoMode();
    return this.execute(() => this.repository.listProposals(requestId, actor));
  }

  listProposalRevisions(actor: DemoActor, proposalId: string): Promise<ProposalRevision[]> {
    this.ensureDemoMode();
    return this.execute(() => this.repository.listProposalRevisions(proposalId, actor));
  }

  acceptProposal(
    actor: DemoActor,
    proposalId: string,
    body: unknown,
    metadata: VersionedCommandMetadata,
  ): Promise<ProposalAcceptance> {
    this.ensureDemoMode();
    this.requireRole(actor, 'CLIENT');
    const input = this.parse(acceptProposalInputSchema, body);
    if (input.acceptanceTextVersion !== ACCEPTANCE_TEXT_VERSION) {
      throw new UnprocessableEntityException({
        code: 'ACCEPTANCE_TEXT_VERSION_INVALID',
        message: 'A versão do texto de aceite não está vigente.',
      });
    }

    const acceptedAt = new Date();
    const holdExpiresAt = new Date(acceptedAt.getTime() + HOLD_DURATION_MINUTES * 60_000);
    return this.execute(() =>
      this.repository.acceptProposal({
        actor,
        proposalId,
        revisionId: input.revisionId,
        acceptanceTextVersion: input.acceptanceTextVersion,
        expectedVersion: metadata.expectedVersion,
        contractId: uuidv7(),
        paymentOrderId: uuidv7(),
        bookingHoldId: uuidv7(),
        acceptedAt: acceptedAt.toISOString(),
        holdExpiresAt: holdExpiresAt.toISOString(),
        correlationId: metadata.correlationId,
        idempotencyKey: metadata.idempotencyKey,
        requestHash: digest({
          operation: 'accept-proposal',
          proposalId,
          expectedVersion: metadata.expectedVersion,
          input,
        }),
      }),
    );
  }

  async getContract(
    actor: DemoActor,
    contractId: string,
    correlationId: string,
  ): Promise<ProposalAcceptance> {
    this.ensureDemoMode();
    const view = await this.repository.findContract(contractId, actor, correlationId);
    if (!view) {
      throw this.notFound('CONTRACT_NOT_FOUND', 'Este contrato não está disponível.');
    }
    return view;
  }

  private prepareRevision(body: unknown): PreparedProposalRevision {
    const input = this.parse(proposalRevisionInputSchema, body);
    this.validateTimezone(input.schedule.timezone);
    const breakdown = calculateBreakdown(input);
    return {
      input,
      breakdown,
      snapshotHash: digest({
        input,
        breakdown,
        cancellationPolicy: CANCELLATION_POLICY,
      }),
    };
  }

  private parse<Output>(
    schema: {
      safeParse(
        value: unknown,
      ):
        | { success: true; data: Output }
        | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
    },
    value: unknown,
  ): Output {
    const result = schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: result.error.issues.map(
        (issue) => `${issue.path.map(String).join('.') || 'request'} ${issue.message}`,
      ),
    });
  }

  private requireRole(
    actor: DemoActor,
    expected: DemoActor['role'],
  ): asserts actor is DemoActor & { role: typeof expected } {
    if (actor.role !== expected) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Este perfil não pode executar a ação solicitada.',
      });
    }
  }

  private requireProfessional(actor: DemoActor): Extract<DemoActor, { role: 'PROFESSIONAL' }> {
    if (actor.role !== 'PROFESSIONAL') {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Este perfil não pode executar a ação solicitada.',
      });
    }
    return actor;
  }

  private ensureDemoMode(): void {
    if (
      this.config.getOrThrow<string>('NODE_ENV') === 'production' ||
      !this.config.getOrThrow<boolean>('DEMO_MODE')
    ) {
      throw new ServiceUnavailableException({
        code: 'DEMO_MODE_DISABLED',
        message: 'Este fluxo demonstrativo não está habilitado.',
      });
    }
  }

  private validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException({
        code: 'TIMEZONE_INVALID',
        message: 'Informe um fuso horário IANA válido.',
      });
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof MarketplaceRepositoryError)) {
        throw error;
      }
      throw this.toHttpException(error.code);
    }
  }

  private toHttpException(code: MarketplaceErrorCode): Error {
    if (['REQUEST_NOT_FOUND', 'PROPOSAL_NOT_FOUND', 'CONTRACT_NOT_FOUND'].includes(code)) {
      return this.notFound(code, 'O recurso não está disponível.');
    }
    if (code === 'TRANSACTION_RETRY_REQUIRED') {
      return new ConflictException({
        code,
        message:
          'A operação concorreu com outra transação. Reenvie o mesmo comando com a mesma chave idempotente.',
        retryable: true,
      });
    }
    if (
      [
        'REQUEST_NOT_DRAFT',
        'REQUEST_NOT_PUBLISHED',
        'REQUEST_VERSION_CONFLICT',
        'PROPOSAL_ALREADY_EXISTS',
        'PROPOSAL_NOT_EDITABLE',
        'PROPOSAL_VERSION_CONFLICT',
        'PROPOSAL_REVISION_STALE',
        'SLOT_UNAVAILABLE',
        'PROPOSAL_ALREADY_ACCEPTED',
        'IDEMPOTENCY_KEY_REUSED',
      ].includes(code)
    ) {
      return new ConflictException({
        code,
        message: 'O recurso mudou ou a operação conflita com o estado atual.',
      });
    }
    return new UnprocessableEntityException({
      code,
      message: 'A operação não atende às regras vigentes.',
    });
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message });
  }
}
