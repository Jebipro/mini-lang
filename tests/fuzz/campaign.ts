import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function campaign(seed: number, count: number, start = 0, options: { worker?: string; caseTimeoutMs?: number } = {}): Promise<unknown> {
  return new Promise((accept, reject) => {
    const child = fork(resolve(options.worker ?? '.tmp/fuzz/tests/fuzz/worker.js'), [String(seed), String(count), String(start)], { execArgv: [], silent: true });
    let current: unknown = null, summary: unknown = null, failure = '', output = '';
    let timer = setTimeout(() => stop('worker startup timeout'), 5000);
    const total = setTimeout(() => stop('campaign timeout'), count <= 512 ? 20000 : 90000);
    function stop(reason: string): void { failure ||= reason; child.kill(); }
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    const collect = (text: string) => { output += text; if (output.length > 1_000_000) stop('worker output limit'); };
    child.stdout?.on('data', collect); child.stderr?.on('data', collect);
    child.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'start' && 'input' in message) {
        current = message.input;
        clearTimeout(timer); timer = setTimeout(() => stop('case timeout'), options.caseTimeoutMs ?? 2000);
        child.send('continue');
      } else if (message.type === 'failure' && 'error' in message) failure = String(message.error);
      else if (message.type === 'done') { summary = message; clearTimeout(timer); }
    });
    child.on('error', error => { failure = error.message; });
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(total);
      if (code === 0 && summary && !failure) { accept(summary); return; }
      mkdirSync('.tmp/fuzz-failures', { recursive: true });
      const path = `.tmp/fuzz-failures/${seed}.json`;
      writeFileSync(path, JSON.stringify({ seed, count, start, current, failure, code, output }, null, 2));
      reject(new Error(`Fuzz failed; replay artifact ${path}: ${failure || output || `exit ${code}`}`));
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const count = Number(process.argv[2] ?? 4096);
  const seeds = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [0x12345678, 0xdeadbeef, 0xc0ffee, 0xabcdef01];
  if (!Number.isSafeInteger(count) || count < 1 || seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new Error('usage: campaign [positive count per seed] [uint32 seed ...]');
  const summaries: unknown[] = [];
  for (const seed of seeds) { const summary = await campaign(seed, count); summaries.push(summary); console.log(JSON.stringify(summary)); }
  mkdirSync('.tmp/fuzz-results', { recursive: true });
  writeFileSync('.tmp/fuzz-results/latest.json', JSON.stringify({ node: process.version, count: count * seeds.length, summaries }, null, 2));
}
