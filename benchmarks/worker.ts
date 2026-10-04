import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { definitions, workload } from './workloads.js';
const definition = definitions().find(item => item.id === process.argv[2]);
assert.ok(definition, 'unknown benchmark');
const task = workload(definition);
const extended = process.argv[3] === '--extended';
const warmup = extended ? 5 : 3, measurements = extended ? 15 : 7;
const samples: number[] = [];
for (let iteration = 0; iteration < warmup + measurements; iteration++) {
  // Input, session initialization and REPL prepopulation are outside the timer.
  const operations = Array.from({ length: task.batch }, () => task.prepare());
  const outputs: number[] = [];
  const start = performance.now();
  for (const operation of operations) outputs.push(operation());
  const elapsed = performance.now() - start;
  for (const output of outputs) assert.equal(output, task.expected, `${definition.id} output`);
  if (iteration >= warmup) samples.push(elapsed / task.batch);
}
const sorted = [...samples].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
assert.ok(median !== undefined);
console.log(JSON.stringify({ ...definition, ...task.details, batch: task.batch, warmup, measurements, samplesMs: samples, minMs: sorted[0], medianMs: median, maxMs: sorted.at(-1), unit: task.unit, unitsPerOperation: task.units, throughputPerSecond: task.units * 1000 / median, ...(definition.group === 'repl' ? { medianAmortizedSubmissionMs: median / definition.size, meanAmortizedSubmissionMs: samples.reduce((a, b) => a + b, 0) / samples.length / definition.size } : {}) }));
