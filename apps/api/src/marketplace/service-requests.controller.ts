import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { requireExpectedVersion, requireIdempotencyKey } from '../common/http/command-headers';
import type { CorrelatedRequest } from '../common/http/correlation-id.middleware';
import type { AuthenticatedActor } from '../identity/authenticated-actor';
import { CurrentActor } from '../identity/current-actor.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { ListServiceRequestsDto } from './dto/list-service-requests.dto';
import { ProposalRevisionDto } from './dto/proposal-revision.dto';
import { MarketplaceService } from './marketplace.service';

function correlationId(request: Request): string {
  return (request as CorrelatedRequest).correlationId ?? 'unavailable';
}

function setEtag(response: Response, version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

@ApiTags('marketplace')
@UseGuards(DemoIdentityGuard)
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Post()
  @ApiOperation({ summary: 'Cria pedido privado em rascunho' })
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: CreateServiceRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const created = await this.marketplace.createRequest(actor, body, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId: correlationId(request),
    });
    setEtag(response, created.version);
    return created;
  }

  @Get()
  @ApiOperation({ summary: 'Lista pedidos próprios ou oportunidades elegíveis' })
  list(@CurrentActor() actor: AuthenticatedActor, @Query() query: ListServiceRequestsDto) {
    return this.marketplace.listRequests(actor, query.scope);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Obtém pedido próprio ou oportunidade sanitizada' })
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('requestId', new ParseUUIDPipe({ version: '7' })) requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const serviceRequest = await this.marketplace.getRequest(actor, requestId);
    setEtag(response, serviceRequest.version);
    return serviceRequest;
  }

  @Post(':requestId/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publica pedido para profissionais elegíveis' })
  async publish(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('requestId', new ParseUUIDPipe({ version: '7' })) requestId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const published = await this.marketplace.publishRequest(actor, requestId, {
      idempotencyKey: requireIdempotencyKey(key),
      expectedVersion: requireExpectedVersion(ifMatch),
      correlationId: correlationId(request),
    });
    setEtag(response, published.version);
    return published;
  }

  @Post(':requestId/proposals')
  @ApiOperation({ summary: 'Cria proposta com primeira revisão imutável' })
  async createProposal(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('requestId', new ParseUUIDPipe({ version: '7' })) requestId: string,
    @Body() body: ProposalRevisionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const proposal = await this.marketplace.createProposal(actor, requestId, body, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId: correlationId(request),
    });
    setEtag(response, proposal.version);
    return proposal;
  }

  @Get(':requestId/proposals')
  @ApiOperation({ summary: 'Lista propostas visíveis à parte autorizada' })
  listProposals(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('requestId', new ParseUUIDPipe({ version: '7' })) requestId: string,
  ) {
    return this.marketplace.listProposals(actor, requestId);
  }
}

@ApiTags('marketplace')
@UseGuards(DemoIdentityGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  @ApiOperation({ summary: 'Alias para oportunidades elegíveis e sanitizadas' })
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.marketplace.listRequests(actor, 'opportunities');
  }
}
