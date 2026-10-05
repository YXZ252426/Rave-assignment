export type ErrorCode =
  'INVALID_INPUT' | 'UNSUPPORTED_ROUTE' | 'INTERNAL_ERROR';

export class ExplorerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ExplorerError';
  }
}
