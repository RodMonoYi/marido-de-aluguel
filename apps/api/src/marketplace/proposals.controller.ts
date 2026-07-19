import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { AcceptProposalDto } from './dto/accept-proposal.dto';
import { ProposalRevisionDto } from './dto/proposal-revision.dto';
import { MarketplaceService } from './marketplace.service';

function correlationId(request: Request): string {
  return (request as CorrelatedRequest).correlationId ?? 'unavailable';
}

@ApiTags('marketplace')
@UseGuards(DemoIdentityGuard)
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get(':proposalId/revisions')
  @ApiOperation({ summary: 'Lista histórico imutável de revisões da proposta' })
  listRevisions(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('proposalId', new ParseUUIDPipe({ version: '7' })) proposalId: string,
  ) {
    return this.marketplace.listProposalRevisions(actor, proposalId);
  }

  @Post(':proposalId/revisions')
  @ApiOperation({ summary: 'Anexa revisão imutável à proposta' })
  async revise(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('proposalId', new ParseUUIDPipe({ version: '7' })) proposalId: string,
    @Body() body: ProposalRevisionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const proposal = await this.marketplace.reviseProposal(actor, proposalId, body, {
      idempotencyKey: requireIdempotencyKey(key),
      expectedVersion: requireExpectedVersion(ifMatch),
      correlationId: correlationId(request),
    });
    response.setHeader('ETag', `"${proposal.version}"`);
    return proposal;
  }

  @Post(':proposalId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Aceita revisão atual e cria contrato, ordem e hold atomicamente' })
  async accept(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('proposalId', new ParseUUIDPipe({ version: '7' })) proposalId: string,
    @Body() body: AcceptProposalDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const acceptance = await this.marketplace.acceptProposal(actor, proposalId, body, {
      idempotencyKey: requireIdempotencyKey(key),
      expectedVersion: requireExpectedVersion(ifMatch),
      correlationId: correlationId(request),
    });
    response.setHeader('ETag', `"${acceptance.contract.version}"`);
    return acceptance;
  }
}

@ApiTags('contracting')
@UseGuards(DemoIdentityGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get(':contractId')
  @ApiOperation({ summary: 'Obtém snapshot e estados separados do contrato' })
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('contractId', new ParseUUIDPipe({ version: '7' })) contractId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const view = await this.marketplace.getContract(actor, contractId, correlationId(request));
    response.setHeader('ETag', `"${view.contract.version}"`);
    return view;
  }
}
