import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiPayload } from './api-payload';
import type { CorrelatedRequest } from './correlation-id.middleware';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();

    return next.handle().pipe(
      map((value: unknown) => {
        const payload = value instanceof ApiPayload ? value : new ApiPayload(value);
        return {
          data: payload.data,
          meta: {
            ...payload.meta,
            correlation_id: request.correlationId ?? 'unavailable',
          },
        };
      }),
    );
  }
}
