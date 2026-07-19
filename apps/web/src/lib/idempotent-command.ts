const STORAGE_PREFIX = 'marido:workflow-idempotency:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fallbackStorage = new Map<string, string>();

export interface RequestDraftCheckpoint {
  draftId: string;
  version: number;
  publicationKey: string;
}

function canonicalJson(value: unknown): string | undefined {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    case 'bigint':
      throw new TypeError('BigInt is not supported in command payloads');
    case 'object':
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item) ?? 'null').join(',')}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toJSON());
  }

  const entries = Object.keys(value)
    .sort()
    .flatMap((key) => {
      const encoded = canonicalJson((value as Record<string, unknown>)[key]);
      return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
    });
  return `{${entries.join(',')}}`;
}

export function canonicalCommand(command: string, payload: unknown): string {
  if (!command.trim()) {
    throw new TypeError('Command name is required');
  }
  return canonicalJson({ command, payload }) ?? '';
}

export async function commandFingerprint(command: string, payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalCommand(command, payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readItem(key: string): string | null {
  try {
    if (globalThis.sessionStorage) {
      return globalThis.sessionStorage.getItem(key);
    }
  } catch {
    // Browsers can deny storage access; the in-memory fallback still protects same-page retries.
  }
  return fallbackStorage.get(key) ?? null;
}

function writeItem(key: string, value: string): void {
  try {
    if (globalThis.sessionStorage) {
      globalThis.sessionStorage.setItem(key, value);
      fallbackStorage.delete(key);
      return;
    }
  } catch {
    // See readItem: never fail a command solely because storage is unavailable.
  }
  fallbackStorage.set(key, value);
}

function removeItem(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Storage denial is handled by the in-memory fallback.
  }
  fallbackStorage.delete(key);
}

async function storageKey(
  kind: 'key' | 'request-draft',
  command: string,
  payload: unknown,
): Promise<string> {
  return `${STORAGE_PREFIX}:${kind}:${await commandFingerprint(command, payload)}`;
}

export async function stableIdempotencyKey(command: string, payload: unknown): Promise<string> {
  const key = await storageKey('key', command, payload);
  const stored = readItem(key);
  if (stored && UUID.test(stored)) return stored;

  if (stored) removeItem(key);
  const created = globalThis.crypto.randomUUID();
  writeItem(key, created);
  return created;
}

export async function clearIdempotencyKey(command: string, payload: unknown): Promise<void> {
  removeItem(await storageKey('key', command, payload));
}

export function isDefinitiveCommandFailure(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500 &&
    'retryable' in error &&
    error.retryable === false
  );
}

export async function loadRequestDraftCheckpoint(
  createCommand: string,
  createPayload: unknown,
): Promise<RequestDraftCheckpoint | null> {
  const key = await storageKey('request-draft', createCommand, createPayload);
  const stored = readItem(key);
  if (!stored) return null;

  try {
    const value: unknown = JSON.parse(stored);
    if (
      value &&
      typeof value === 'object' &&
      'draftId' in value &&
      typeof value.draftId === 'string' &&
      UUID.test(value.draftId) &&
      'version' in value &&
      typeof value.version === 'number' &&
      Number.isInteger(value.version) &&
      value.version > 0 &&
      'publicationKey' in value &&
      typeof value.publicationKey === 'string' &&
      UUID.test(value.publicationKey)
    ) {
      return {
        draftId: value.draftId,
        version: value.version,
        publicationKey: value.publicationKey,
      };
    }
  } catch {
    // Corrupt or stale browser state must fail closed and be replaced.
  }

  removeItem(key);
  return null;
}

export async function saveRequestDraftCheckpoint(
  createCommand: string,
  createPayload: unknown,
  checkpoint: RequestDraftCheckpoint,
): Promise<void> {
  if (
    !UUID.test(checkpoint.draftId) ||
    !Number.isInteger(checkpoint.version) ||
    checkpoint.version <= 0 ||
    !UUID.test(checkpoint.publicationKey)
  ) {
    throw new TypeError('Invalid request draft checkpoint');
  }

  const key = await storageKey('request-draft', createCommand, createPayload);
  writeItem(
    key,
    JSON.stringify({
      draftId: checkpoint.draftId,
      version: checkpoint.version,
      publicationKey: checkpoint.publicationKey,
    }),
  );
}

export async function clearRequestDraftCheckpoint(
  createCommand: string,
  createPayload: unknown,
): Promise<void> {
  removeItem(await storageKey('request-draft', createCommand, createPayload));
}
