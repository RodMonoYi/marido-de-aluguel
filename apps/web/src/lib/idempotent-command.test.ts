import { webcrypto } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearIdempotencyKey,
  commandFingerprint,
  isDefinitiveCommandFailure,
  loadRequestDraftCheckpoint,
  saveRequestDraftCheckpoint,
  stableIdempotencyKey,
} from './idempotent-command';

const FIRST_KEY = '019b0000-0000-7000-8000-000000000901';

describe('browser command idempotency', () => {
  const randomUUID = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    randomUUID.mockReset();
    randomUUID.mockReturnValue(FIRST_KEY);
    vi.stubGlobal('crypto', {
      randomUUID,
      subtle: webcrypto.subtle,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('produces the same SHA-256 fingerprint regardless of object key order', async () => {
    const first = await commandFingerprint('proposal:create', {
      body: { included: ['Montagem'], amounts: { labor: 25_000, travel: 0 } },
      expectedVersion: 1,
    });
    const reordered = await commandFingerprint('proposal:create', {
      expectedVersion: 1,
      body: { amounts: { travel: 0, labor: 25_000 }, included: ['Montagem'] },
    });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toBe(first);
  });

  it('reuses the same UUID after a module reload for the same command and payload', async () => {
    const payload = { body: { revisionId: 'revision-1' }, expectedVersion: 3 };
    const first = await stableIdempotencyKey('proposal:accept', payload);

    vi.resetModules();
    const reloaded = await import('./idempotent-command');
    const second = await reloaded.stableIdempotencyKey('proposal:accept', payload);

    expect(first).toBe(FIRST_KEY);
    expect(second).toBe(FIRST_KEY);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('creates a new key after the previous command is definitively completed', async () => {
    const secondKey = '019b0000-0000-7000-8000-000000000904';
    randomUUID.mockReset();
    randomUUID.mockReturnValueOnce(FIRST_KEY).mockReturnValueOnce(secondKey);
    const payload = { body: { revisionId: 'revision-1' }, expectedVersion: 3 };

    await expect(stableIdempotencyKey('proposal:accept', payload)).resolves.toBe(FIRST_KEY);
    await clearIdempotencyKey('proposal:accept', payload);
    await expect(stableIdempotencyKey('proposal:accept', payload)).resolves.toBe(secondKey);
  });

  it('distinguishes definitive 4xx failures from ambiguous or retryable failures', () => {
    expect(isDefinitiveCommandFailure({ status: 422, retryable: false })).toBe(true);
    expect(isDefinitiveCommandFailure({ status: 409, retryable: true })).toBe(false);
    expect(isDefinitiveCommandFailure({ status: 0, retryable: true })).toBe(false);
    expect(isDefinitiveCommandFailure(new Error('unknown failure'))).toBe(false);
  });

  it('stores only digests and non-PII command metadata', async () => {
    const createPayload = {
      body: {
        title: 'Conserto no endereço residencial de Marina',
        description: 'Documento 123.456.789-00',
        city: 'Salvador',
      },
    };
    const publicationKey = '019b0000-0000-7000-8000-000000000902';

    await stableIdempotencyKey('request:create', createPayload);
    await saveRequestDraftCheckpoint('request:create', createPayload, {
      draftId: '019b0000-0000-7000-8000-000000000903',
      version: 1,
      publicationKey,
    });

    const persisted = Array.from({ length: sessionStorage.length }, (_, index) => {
      const key = sessionStorage.key(index) ?? '';
      return `${key}:${sessionStorage.getItem(key) ?? ''}`;
    }).join('|');
    expect(persisted).not.toContain('Marina');
    expect(persisted).not.toContain('123.456.789-00');
    expect(persisted).not.toContain('Salvador');
    await expect(loadRequestDraftCheckpoint('request:create', createPayload)).resolves.toEqual({
      draftId: '019b0000-0000-7000-8000-000000000903',
      version: 1,
      publicationKey,
    });
  });
});
