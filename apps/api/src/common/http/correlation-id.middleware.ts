import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';

export type CorrelatedRequest = Request & { correlationId?: string };

const VALID_CORRELATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    const incoming = request.header('x-correlation-id');
    const correlationId =
      incoming && VALID_CORRELATION_ID.test(incoming) ? incoming.toLowerCase() : uuidv7();

    request.correlationId = correlationId;
    response.setHeader('X-Correlation-ID', correlationId);
    next();
  }
}
