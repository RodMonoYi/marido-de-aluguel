import { BadRequestException } from '@nestjs/common';

const IDEMPOTENCY_KEY = /^[\x21-\x7e]{16,128}$/;
const ENTITY_TAG = /^"([1-9][0-9]*)"$/;

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !IDEMPOTENCY_KEY.test(value)) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Informe uma Idempotency-Key opaca entre 16 e 128 caracteres.',
    });
  }
  return value;
}

export function requireExpectedVersion(value: string | undefined): number {
  const match = value?.match(ENTITY_TAG);
  const parsed = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestException({
      code: 'IF_MATCH_REQUIRED',
      message: 'Informe a versão atual do recurso no cabeçalho If-Match.',
    });
  }
  return parsed;
}
