export class ApiPayload<T> {
  constructor(
    readonly data: T,
    readonly meta: Record<string, unknown> = {},
  ) {}
}

export function apiPayload<T>(data: T, meta: Record<string, unknown> = {}): ApiPayload<T> {
  return new ApiPayload(data, meta);
}
