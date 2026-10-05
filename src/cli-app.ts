import { readFile } from 'node:fs/promises';
import { Command, CommanderError, Option } from 'commander';
import { LiFiIntentAdapter } from './adapters/lifi-intent-adapter.js';
import { BebopClient, type QuoteProvider } from './clients/bebop-client.js';
import { readBebopApiKey } from './config/environment.js';
import { createDemoReport } from './demo/demo.js';
import {
  LiFiClient,
  type ChainCatalogProvider,
} from './clients/lifi-client.js';
import { CompareService } from './services/compare-service.js';
import { ExplorerError, serializeError } from './domain/errors.js';
import {
  renderChains,
  renderComparison,
  renderNormalizedRequest,
  renderQuote,
} from './presentation/text.js';
import { QuoteService } from './services/quote-service.js';

interface CliDependencies {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  provider?: QuoteProvider;
  lifiProvider?: ChainCatalogProvider;
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
  let commandExitCode = 0;
  async function bebopProvider(): Promise<QuoteProvider> {
    if (dependencies.provider) return dependencies.provider;
    const apiKey = await readBebopApiKey(dependencies.env);
    return new BebopClient(apiKey ? { apiKey } : {});
  }
  const program = new Command()
    .name('intent-rfq')
    .description(
      'Read-only intent normalization and Bebop RFQ quote inspection.',
    )
    .version('0.4.0')
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
      const provider = await bebopProvider();
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
    .command('chains')
    .description(
      'Discover LI.FI Intents chains and the local supported intersection',
    )
    .addOption(
      new Option('--provider <provider>', 'Chain discovery provider')
        .choices(['lifi'])
        .default('lifi'),
    )
    .option('--json', 'Output the chain catalog as JSON')
    .action(async (options: { json?: boolean }) => {
      const catalog = await (
        dependencies.lifiProvider ?? new LiFiClient()
      ).getSupportedChains(dependencies.signal);
      stdout(
        (options.json
          ? JSON.stringify(catalog, null, 2)
          : renderChains(catalog)) + '\n',
      );
    });

  program
    .command('compare')
    .description('Compare sequential Bebop quotes for one to five trade sizes')
    .requiredOption('--intent <file>', 'Path to the base intent JSON file')
    .requiredOption(
      '--amounts <sizes>',
      'Comma-separated positive human-unit decimal sizes',
    )
    .option('--json', 'Output all successful, failed, and skipped rows as JSON')
    .action(async (options: IntentOptions & { amounts: string }) => {
      const input = await loadIntent(options.intent);
      const sizes = options.amounts.split(',').map((value) => value.trim());
      const report = await new CompareService(
        await bebopProvider(),
        dependencies.now,
      ).compare(input, sizes, dependencies.signal);
      stdout(
        (options.json
          ? JSON.stringify(report, null, 2)
          : renderComparison(report)) + '\n',
      );
      commandExitCode =
        report.outcome === 'cancelled'
          ? 130
          : report.outcome === 'complete'
            ? 0
            : 1;
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
    return commandExitCode;
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
          error: serializeError(failure),
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
