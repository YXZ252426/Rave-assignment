import { runCli } from './cli-app.js';

const controller = new AbortController();
const cancel = () => controller.abort();
process.once('SIGINT', cancel);
try {
  process.exitCode = await runCli(process.argv.slice(2), {
    signal: controller.signal,
  });
} finally {
  process.removeListener('SIGINT', cancel);
}
