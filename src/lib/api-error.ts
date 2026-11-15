/** A failed platform response that keeps the HTTP status and the server's error code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? null;
  }
}

/**
 * The server answers 404 for a project that does not exist, is closed, or is not public yet.
 * Only a real 404 counts: unavailable (503), timeouts and network failures stay retryable errors.
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
