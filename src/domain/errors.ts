export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_ROUTE'
  | 'INTERNAL_ERROR'
  | 'NO_QUOTE'
  | 'UPSTREAM_AUTH_ERROR'
  | 'UPSTREAM_ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_FAILURE'
  | 'INVALID_UPSTREAM_RESPONSE'
  | 'REQUEST_CANCELLED';

interface ErrorDetails {
  retryable?: boolean;
  retryAfterMs?: number | undefined;
  attempts?: number;
}

export class ExplorerError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly attempts: number | undefined;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly field?: string,
    readonly httpStatus?: number,
    details: ErrorDetails = {},
  ) {
    super(message);
    this.name = 'ExplorerError';
    this.retryable = details.retryable ?? false;
    this.retryAfterMs = details.retryAfterMs;
    this.attempts = details.attempts;
  }
  withAttempts(attempts: number): ExplorerError {
    return new ExplorerError(
      this.code,
      this.message,
      this.field,
      this.httpStatus,
      { retryable: this.retryable, retryAfterMs: this.retryAfterMs, attempts },
    );
  }
}
