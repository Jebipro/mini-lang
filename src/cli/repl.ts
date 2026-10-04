import { createInterface } from 'node:readline';
import { Repl } from '../repl.js';
const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const input = createInterface({ input: process.stdin, output: process.stdout, terminal });
// A closed stdout/stderr is a host I/O failure: exit 2, no Node stack trace.
process.stdout.on('error', error => { process.exitCode = 2; process.stderr.write(`IOError: ${error.message}\n`); input.close(); });
process.stderr.on('error', () => { process.exitCode = 2; input.close(); });
const repl = new Repl({
  writeOutput: text => { process.stdout.write(text); },
  writeDiagnostic: text => { process.stderr.write(text); },
  showPrompt: text => { if (terminal) { input.setPrompt(text); input.prompt(); } }
});
input.on('line', line => {
  try { repl.submitLine(line); }
  catch (error) { process.stderr.write(`InternalError: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; input.close(); }
});
input.on('SIGINT', () => repl.cancelInput());
input.on('close', () => { if (process.exitCode !== 2) process.exitCode = repl.endInput(); });
