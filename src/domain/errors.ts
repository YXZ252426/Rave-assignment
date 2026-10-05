export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_ROUTE'
  | 'INTERNAL_ERROR'
  | 'UPSTREAM_AUTH_ERROR'
  | 'UPSTREAM_ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_FAILURE'
  | 'INVALID_UPSTREAM_RESPONSE';

export class ExplorerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly field?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ExplorerError';
  }
}
