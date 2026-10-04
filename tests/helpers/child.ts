import { spawn } from 'node:child_process';
export interface ChildResult { status: number | null; stdout: string; stderr: string; timedOut: boolean }
export function runChild(args: string[], timeout = 2000, input = '', executable = process.execPath): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'pipe', windowsHide: true });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => { stdout += data; if (stdout.length > 1_000_000) child.kill(); });
    child.stderr.on('data', (data: string) => { stderr += data; if (stderr.length > 1_000_000) child.kill(); });
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr, timedOut }); });
    child.stdin.on('error', () => { /* A child may finish before consuming input. */ });
    child.stdin.end(input);
  });
}
