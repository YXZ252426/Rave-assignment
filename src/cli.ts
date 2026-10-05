import { readFile } from 'node:fs/promises';
import { Command, CommanderError } from 'commander';
import { LiFiIntentAdapter } from './adapters/lifi-intent-adapter.js';
import { ExplorerError } from './domain/errors.js';
import { renderNormalizedRequest } from './presentation/text.js';

const program = new Command()
  .name('intent-rfq')
  .description(
    'Read-only intent-to-RFQ explorer. G1: offline intent normalization.',
  )
  .version('0.1.0')
  .showSuggestionAfterError(false)
  .exitOverride()
  .configureOutput({ writeErr: () => {} });

program
  .command('normalize')
  .description(
    'Validate an intent file and inspect its normalized quote request without networking',
  )
  .requiredOption(
    '--intent <file>',
    'Path to a simplified swap intent JSON file',
  )
  .option('--json', 'Output the normalized request as JSON')
  .action(async (options: { intent: string; json?: boolean }) => {
    let content: string;
    try {
      content = await readFile(options.intent, 'utf8');
    } catch {
      throw new ExplorerError(
        'INVALID_INPUT',
        'Cannot read the intent file; check its path and permissions.',
        'intent',
      );
    }
    let input: unknown;
    try {
      input = JSON.parse(content);
    } catch {
      throw new ExplorerError(
        'INVALID_INPUT',
        'The intent file must contain valid JSON.',
        'intent',
      );
    }
    const request = new LiFiIntentAdapter().normalize(input);
    process.stdout.write(
      (options.json
        ? JSON.stringify(request, null, 2)
        : renderNormalizedRequest(request)) + '\n',
    );
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
  } else {
    const failure =
      error instanceof ExplorerError
        ? error
        : error instanceof CommanderError
          ? new ExplorerError('INVALID_INPUT', error.message, 'command')
          : new ExplorerError(
              'INTERNAL_ERROR',
              'Unexpected failure while processing the intent.',
            );
    // Keep diagnostics on stderr and omit stack traces from normal output.
    const output = process.argv.includes('--json')
      ? JSON.stringify({
          error: {
            code: failure.code,
            message: failure.message,
            field: failure.field,
          },
        })
      : `${failure.code}${failure.field ? ` [${failure.field}]` : ''}: ${failure.message}`;
    process.stderr.write(output + '\n');
    process.exitCode = failure.code === 'INTERNAL_ERROR' ? 1 : 2;
  }
}
