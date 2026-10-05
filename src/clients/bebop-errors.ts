import { ExplorerError } from '../domain/errors.js';

export function checkBebopError(body: unknown): void {
  if (!body || typeof body !== 'object') return;
  if ('error' in body) {
    const error = body.error;
    // Verified by docs/evidence/g3-provider-error.json; do not guess unknown codes.
    if (
      error &&
      typeof error === 'object' &&
      'errorCode' in error &&
      error.errorCode === 104 &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.startsWith('MinSize:')
    ) {
      throw new ExplorerError(
        'NO_QUOTE',
        'Bebop cannot quote this trade size because it is below the provider minimum. Try a larger amount.',
        'amountIn',
      );
    }
    throw new ExplorerError(
      'UPSTREAM_FAILURE',
      'Bebop returned a provider error.',
    );
  }
  if ('status' in body && body.status !== 'SIG_SUCCESS')
    throw new ExplorerError(
      'UPSTREAM_FAILURE',
      'Bebop returned a non-success quote status.',
    );
}
