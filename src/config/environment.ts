import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { ExplorerError } from '../domain/errors.js';

export async function readBebopApiKey(
  env: NodeJS.ProcessEnv = process.env,
  path = '.env',
): Promise<string | undefined> {
  // Only this key is consumed; dotenv values do not mutate process.env.
  if (env.BEBOP_API_KEY !== undefined)
    return env.BEBOP_API_KEY.trim() || undefined;
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return undefined;
    throw new ExplorerError(
      'INVALID_INPUT',
      'Cannot read the optional environment file.',
      'BEBOP_API_KEY',
    );
  }
  return parseEnv(content).BEBOP_API_KEY?.trim() || undefined;
}
