import { readFile } from 'node:fs/promises';
import { Command, CommanderError } from 'commander';
import { LiFiIntentAdapter } from './adapters/lifi-intent-adapter.js';
import { BebopClient, type QuoteProvider } from './clients/bebop-client.js';
import { readBebopApiKey } from './config/environment.js';
import { createDemoReport } from './demo/demo.js';
import { ExplorerError } from './domain/errors.js';
import { renderNormalizedRequest, renderQuote } from './presentation/text.js';
import { QuoteService } from './services/quote-service.js';

interface CliDependencies {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  provider?: QuoteProvider;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}
interface IntentOptions {
  intent: string;
  json?: boolean;
}

async function loadIntent(path: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch {
    throw new ExplorerError(
      'INVALID_INPUT',
      'Cannot read the intent file; check its path and permissions.',
      'intent',
    );
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ExplorerError(
      'INVALID_INPUT',
      'The intent file must contain valid JSON.',
      'intent',
    );
  }
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const stdout =
    dependencies.stdout ??
    ((text: string) => {
      process.stdout.write(text);
    });
  const stderr =
    dependencies.stderr ??
    ((text: string) => {
      process.stderr.write(text);
    });
  const program = new Command()
    .name('intent-rfq')
    .description(
      'Read-only intent normalization and Bebop RFQ quote inspection.',
    )
    .version('0.3.0')
    .showSuggestionAfterError(false)
    .exitOverride()
    .configureOutput({ writeOut: stdout, writeErr: () => {} });

  program
    .command('normalize')
    .description('Validate an intent without networking')
    .requiredOption(
      '--intent <file>',
      'Path to a simplified swap intent JSON file',
    )
    .option('--json', 'Output the normalized request as JSON')
    .action(async (options: IntentOptions) => {
      const request = new LiFiIntentAdapter().normalize(
        await loadIntent(options.intent),
      );
      stdout(
        (options.json
          ? JSON.stringify(request, null, 2)
          : renderNormalizedRequest(request)) + '\n',
      );
    });

  program
    .command('quote')
    .description(
      'Request and inspect a Bebop RFQ quote (no signing or submission)',
    )
    .requiredOption(
      '--intent <file>',
      'Path to a simplified swap intent JSON file',
    )
    .option('--json', 'Output the quote report as JSON')
    .action(async (options: IntentOptions) => {
      const input = await loadIntent(options.intent);
      let provider = dependencies.provider;
      if (!provider) {
        const apiKey = await readBebopApiKey(dependencies.env);
        provider = new BebopClient(apiKey ? { apiKey } : {});
      }
      const report = await new QuoteService(provider, dependencies.now).quote(
        input,
        dependencies.signal,
      );
      stdout(
        (options.json ? JSON.stringify(report, null, 2) : renderQuote(report)) +
          '\n',
      );
    });

  program
    .command('demo')
    .description(
      'Show an expired synthetic quote offline, with a fixed historical clock',
    )
    .option('--json', 'Output the labeled MOCK example as JSON')
    .action((options: { json?: boolean }) => {
      const report = createDemoReport();
      stdout(
        (options.json
          ? JSON.stringify(report, null, 2)
          : report.demo.note + '\n' + renderQuote(report)) + '\n',
      );
    });

  try {
    await program.parseAsync(args, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const failure =
      error instanceof ExplorerError
        ? error
        : error instanceof CommanderError
          ? new ExplorerError('INVALID_INPUT', error.message, 'command')
          : new ExplorerError(
              'INTERNAL_ERROR',
              'Unexpected failure while processing the request.',
            );
    const output = args.includes('--json')
      ? JSON.stringify({
          error: {
            code: failure.code,
            message: failure.message,
            field: failure.field,
            httpStatus: failure.httpStatus,
            attempts: failure.attempts,
            retryable: failure.retryable,
            retryAfterMs: failure.retryAfterMs,
          },
        })
      : `${failure.code}${failure.field ? ` [${failure.field}]` : ''}: ${failure.message}`;
    const guidance = args.includes('--json')
      ? ''
      : [
          failure.attempts !== undefined
            ? ` Attempts: ${failure.attempts}.`
            : '',
          failure.retryAfterMs !== undefined
            ? ` Provider requests a wait of at least ${Math.ceil(failure.retryAfterMs / 1000)} seconds before another attempt.`
            : '',
        ].join('');
    stderr(output.replace(/\u001b/g, '') + guidance + '\n');
    if (failure.code === 'REQUEST_CANCELLED') return 130;
    return failure.code === 'INVALID_INPUT' ||
      failure.code === 'UNSUPPORTED_ROUTE'
      ? 2
      : 1;
  }
}
