import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { CorrelatedRequest } from './correlation-id.middleware';

interface HttpErrorBody {
  code?: string;
  message?: string | string[];
  retryable?: boolean;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException
        ? exception.getResponse()
        : { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' };
    const body: HttpErrorBody = typeof raw === 'string' ? { message: raw } : raw;
    const validationMessages = Array.isArray(body.message) ? body.message : undefined;

    response.status(status).json({
      error: {
        code:
          body.code ??
          (status === HttpStatus.BAD_REQUEST
            ? 'VALIDATION_ERROR'
            : (HttpStatus[status] ?? 'ERROR')),
        message: validationMessages
          ? 'Revise os campos informados.'
          : (body.message ?? 'Não foi possível concluir a operação.'),
        ...(validationMessages
          ? {
              fields: validationMessages.map((message) => ({
                field: message.split(' ')[0] ?? 'request',
                code: 'INVALID',
              })),
            }
          : {}),
        retryable: body.retryable ?? status >= 500,
      },
      meta: {
        correlation_id:
          request.correlationId ?? request.header('x-correlation-id') ?? 'unavailable',
      },
    });
  }
}
