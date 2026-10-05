import { performance } from 'node:perf_hooks';
import { ExplorerError } from '../domain/errors.js';

export type FetchLike = (url: URL, init: RequestInit) => Promise<Response>;
export interface HttpOptions {
  fetch?: FetchLike;
  now?: () => number;
  elapsedNow?: () => number;
  timeoutMs?: number;
  totalTimeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
  random?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Retry-After accepts delta-seconds or HTTP-date; never reinterpret digits as dates. */
export function parseRetryAfter(
  value: string | null,
  now: number,
): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (/^[0-9]+$/.test(text))
    return Math.min(Number.MAX_SAFE_INTEGER, Number(text) * 1000);
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*(?:,| )/.test(text))
    return undefined;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

function abortable<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }),
    cancelled,
  ]).finally(() => signal.removeEventListener('abort', abort));
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function discard(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

async function readJson(
  response: Response,
  signal: AbortSignal,
  maxBytes: number,
): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    discard(response);
    throw new ExplorerError(
      'INVALID_UPSTREAM_RESPONSE',
      'Upstream response exceeds the permitted size.',
    );
  }
  if (!response.body)
    throw new ExplorerError(
      'INVALID_UPSTREAM_RESPONSE',
      'Upstream returned an empty response.',
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    while (true) {
      const chunk = await abortable(() => reader.read(), signal);
      if (chunk.done) {
        complete = true;
        break;
      }
      size += chunk.value.byteLength;
      if (size > maxBytes)
        throw new ExplorerError(
          'INVALID_UPSTREAM_RESPONSE',
          'Upstream response exceeds the permitted size.',
        );
      chunks.push(chunk.value);
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
  } catch {
    throw new ExplorerError(
      'INVALID_UPSTREAM_RESPONSE',
      'Upstream returned a response that is not valid JSON.',
    );
  }
}

function httpFailure(response: Response, now: number): ExplorerError {
  const status = response.status;
  const retryAfterMs = parseRetryAfter(
    response.headers.get('retry-after'),
    now,
  );
  if (status === 401)
    return new ExplorerError(
      'UPSTREAM_AUTH_ERROR',
      'Upstream rejected authentication (HTTP 401). Check the provider API key.',
      undefined,
      status,
    );
  if (status === 403)
    return new ExplorerError(
      'UPSTREAM_ACCESS_DENIED',
      'Upstream access denied (HTTP 403); an API authentication failure has not been established.',
      undefined,
      status,
    );
  if (status === 429)
    return new ExplorerError(
      'RATE_LIMITED',
      'Upstream rate limit reached (HTTP 429).',
      undefined,
      status,
      { retryable: true, retryAfterMs },
    );
  return new ExplorerError(
    'UPSTREAM_FAILURE',
    `Upstream request failed (HTTP ${status}).`,
    undefined,
    status,
    { retryable: [408, 500, 502, 503, 504].includes(status), retryAfterMs },
  );
}

function transportFailure(error: unknown): ExplorerError {
  const cause =
    error && typeof error === 'object' && 'cause' in error
      ? error.cause
      : error;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined;
  const retryable =
    typeof code === 'string' &&
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
    ].includes(code);
  return new ExplorerError(
    'UPSTREAM_FAILURE',
    'Could not complete the upstream request. Check network access and proxy configuration.',
    undefined,
    undefined,
    { retryable },
  );
}

function cancelled(): ExplorerError {
  return new ExplorerError('REQUEST_CANCELLED', 'Request cancelled.');
}
function deadline(retryable = false): ExplorerError {
  return new ExplorerError(
    'UPSTREAM_TIMEOUT',
    'Upstream request exceeded its time budget.',
    undefined,
    undefined,
    { retryable },
  );
}
function checkedInteger(
  value: number,
  min: number,
  max: number,
  name: string,
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}.`);
  return value;
}

export class JsonHttpClient {
  private readonly fetch: FetchLike;
  private readonly now: () => number;
  private readonly elapsedNow: () => number;
  private readonly timeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxResponseBytes: number;
  private readonly random: () => number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;

  constructor(options: HttpOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.elapsedNow = options.elapsedNow ?? (() => performance.now());
    this.timeoutMs = checkedInteger(
      options.timeoutMs ?? 10000,
      1,
      30000,
      'attempt timeout',
    );
    this.totalTimeoutMs = checkedInteger(
      options.totalTimeoutMs ?? 20000,
      1,
      60000,
      'total timeout',
    );
    this.maxRetries = checkedInteger(
      options.maxRetries ?? 2,
      0,
      2,
      'retry count',
    );
    this.maxResponseBytes = checkedInteger(
      options.maxResponseBytes ?? 1048576,
      1,
      1048576,
      'response size',
    );
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? delay;
  }

  async get<T>(
    url: URL,
    options: {
      headers?: Record<string, string>;
      signal?: AbortSignal;
      parse: (body: unknown) => T;
    },
  ): Promise<T> {
    const started = this.elapsedNow();
    const budget = new AbortController();
    const budgetTimer = setTimeout(() => budget.abort(), this.totalTimeoutMs);
    const overall = AbortSignal.any([
      budget.signal,
      ...(options.signal ? [options.signal] : []),
    ]);
    let attempts = 0;
    const remaining = () => this.totalTimeoutMs - (this.elapsedNow() - started);
    try {
      while (true) {
        if (options.signal?.aborted) throw cancelled();
        if (overall.aborted || remaining() <= 0) throw deadline();
        const attempt = new AbortController();
        const signal = AbortSignal.any([overall, attempt.signal]);
        const attemptTimer = setTimeout(
          () => attempt.abort(),
          Math.min(this.timeoutMs, remaining()),
        );
        attempts++;
        let failure: ExplorerError;
        try {
          const response = await abortable(
            () =>
              this.fetch(url, {
                method: 'GET',
                headers: options.headers ?? { Accept: 'application/json' },
                signal,
                redirect: 'error',
              }),
            signal,
          );
          if (!response.ok) {
            discard(response);
            throw httpFailure(response, this.now());
          }
          const body = await readJson(response, signal, this.maxResponseBytes);
          const parsed = options.parse(body);
          if (signal.aborted || remaining() <= 0) throw deadline();
          return parsed;
        } catch (error) {
          failure = options.signal?.aborted
            ? cancelled()
            : overall.aborted || remaining() <= 0
              ? deadline()
              : signal.aborted
                ? deadline(true)
                : error instanceof ExplorerError
                  ? error
                  : transportFailure(error);
        } finally {
          clearTimeout(attemptTimer);
        }
        if (!failure.retryable || attempts > this.maxRetries) throw failure;
        const sample = Math.max(0, Math.min(1, this.random()));
        const backoff = Math.floor(
          Math.min(2000, 250 * 2 ** (attempts - 1)) * (0.5 + sample * 0.5),
        );
        const waitMs = Math.max(backoff, failure.retryAfterMs ?? 0);
        // A valid Retry-After is a lower bound. Never clamp it down to our budget.
        if (waitMs >= remaining()) throw failure;
        try {
          await abortable(() => this.sleep(waitMs, overall), overall);
        } catch {
          throw options.signal?.aborted ? cancelled() : deadline();
        }
      }
    } catch (error) {
      if (error instanceof ExplorerError) throw error.withAttempts(attempts);
      throw error;
    } finally {
      clearTimeout(budgetTimer);
    }
  }
}
