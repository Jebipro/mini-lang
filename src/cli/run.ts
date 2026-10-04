import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { LangError, formatError } from '../errors.js';
import { runScript } from '../runner.js';
// A closed stdout/stderr (e.g. `| head`) is a host I/O failure: exit 2, no Node stack trace.
process.stdout.on('error', error => { process.exitCode = 2; process.stderr.write(`IOError: ${error.message}\n`); });
process.stderr.on('error', () => { process.exitCode = 2; });
function main(): number {
  const args = process.argv.slice(2), path = args[0];
  if (args.length !== 1 || path === undefined) { process.stderr.write('Usage: mini-lang <file.lang>\n'); return 2; }
  let text: string;
  try { text = readFileSync(path, 'utf8'); }
  catch (error) { process.stderr.write(`IOError: ${error instanceof Error ? error.message : String(error)}\n`); return 2; }
  try { runScript(text, basename(path), text => process.stdout.write(text)); return 0; }
  catch (error) {
    if (error instanceof LangError) { process.stderr.write(formatError(error) + '\n'); return 1; }
    process.stderr.write(`InternalError: ${error instanceof Error ? error.message : String(error)}\n`); return 2;
  }
}
process.exitCode = main();
