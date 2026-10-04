import { spawnSync, execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { definitions } from './workloads.js';
const extended = process.argv.includes('--extended');
const results: unknown[] = [];
const startedAt = new Date().toISOString();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
for (const definition of definitions()) {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./worker.js', import.meta.url)), definition.id, ...(extended ? ['--extended'] : [])], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 2_000_000 });
  if (child.error || child.status !== 0) throw new Error(`${definition.id}: ${child.error?.message ?? child.stderr}`);
  const result: unknown = JSON.parse(child.stdout);
  results.push(result);
  console.log(`Completed ${results.length}: ${definition.id}`);
}
mkdirSync('benchmarks/results', { recursive: true });
const path = `benchmarks/results/node-${process.versions.node}-${extended ? 'extended' : 'baseline'}.json`;
writeFileSync(path, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), sourceCommit: head, node: process.version, v8: process.versions.v8, platform: process.platform, osRelease: release(), arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), profile: extended ? 'extended' : 'baseline', warmup: extended ? 5 : 3, measurements: extended ? 15 : 7, timer: 'performance.now', processPerWorkload: true, results }, null, 2) + '\n');
console.log(`Saved ${path}`);
