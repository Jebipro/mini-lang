// Independent blind-review CLI regressions (see CLAUDE_BLIND_REVIEW.md).
import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChild } from '../helpers/child.js';

async function withScript<T>(text: string | Buffer, action: (path: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'mini-lang-br-'));
  const path = join(directory, 'br.lang');
  try { writeFileSync(path, text); return await action(path); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

// Reads the first stdout chunk, then closes the read end so later writes hit EPIPE.
function closeStdoutEarly(args: string[], input = ''): Promise<{ status: number | null; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'pipe', windowsHide: true });
    let stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 8000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data: string) => { stderr += data; });
    child.stdout.once('data', () => child.stdout.destroy());
    child.on('close', status => { clearTimeout(timer); resolve({ status, stderr, timedOut }); });
    child.stdin.on('error', () => { /* child may exit before reading input */ });
    child.stdin.end(input);
  });
}
const flood = 'let i=0;while(i<200000){print(i);i=i+1;}';

it('BR-02 script stdout closed early is an I/O error (exit 2) without a host stack trace', async () => {
  const result = await withScript(flood, path => closeStdoutEarly(['dist/cli/run.js', path]));
  expect(result.timedOut).toBe(false);
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/^IOError: .*EPIPE/m);
  expect(result.stderr).not.toMatch(/node:|Unhandled 'error' event|\n\s+at /);
});

it('BR-02 REPL stdout closed early is an I/O error (exit 2) without a host stack trace', async () => {
  const result = await closeStdoutEarly(['dist/cli/repl.js'], flood + '\n');
  expect(result.timedOut).toBe(false);
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/^IOError: .*EPIPE/m);
  expect(result.stderr).not.toMatch(/node:|Unhandled 'error' event|\n\s+at /);
});

it('BRC-05 keeps stdout written before a runtime error and prints the exact diagnostic', async () => {
  const result = await withScript('print(1);\nlet x = 1 + "a";\n', path => runChild(['dist/cli/run.js', path]));
  expect(result).toEqual({ status: 1, stdout: '1\n', stderr: 'TypeError at br.lang:2:11: operator \'+\' cannot be applied to number and string\nlet x = 1 + "a";\n          ^\n', timedOut: false });
});

it('BRC-05 runs a BOM + CRLF script and anchors diagnostics by UTF-16 line/column', async () => {
  const text = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('print("한😀");\r\n\tmissing;\r\n', 'utf8')]);
  const result = await withScript(text, path => runChild(['dist/cli/run.js', path]));
  expect(result).toEqual({ status: 1, stdout: '한😀\n', stderr: "RuntimeError at br.lang:2:2: undefined variable 'missing'\n missing;\n ^\n", timedOut: false });
});

it('BRC-05 rejects a syntax error before running any statement', async () => {
  const result = await withScript('print(1);\nprint(2', path => runChild(['dist/cli/run.js', path]));
  expect(result).toEqual({ status: 1, stdout: '', stderr: "SyntaxError at br.lang:2:8: expected ')' but found EOF\nprint(2\n       ^\n", timedOut: false });
});

it('BRC-05 REPL accepts CRLF piped input and keeps multi-line submissions together', async () => {
  const result = await runChild(['dist/cli/repl.js'], 3000, 'let x=1;\r\nfn f(){\r\nreturn x+1;\r\n}\r\nf()\r\nx\r\n');
  expect(result).toEqual({ status: 0, stdout: '2\n1\n', stderr: '', timedOut: false });
});
