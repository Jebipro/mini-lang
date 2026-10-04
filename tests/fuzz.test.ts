import { expect, it } from 'vitest';
import { campaign } from './fuzz/campaign.js';
import { generate } from './fuzz/generator.js';
import { readFileSync } from 'node:fs';
it('FUZZ deterministic index replay is independent of earlier generation', () => {
  const before = generate(123, 37);
  for (let i = 0; i < 100; i++) generate(456, i);
  expect(generate(123, 37)).toEqual(before);
  expect(generate(124, 38)).not.toEqual(generate(123, 38));
});
it.each([0x10203040, 0x55667788, 0x13579bdf, 0x2468ace0])('FUZZ isolated smoke seed %s (512 cases)', async seed => {
  expect(await campaign(seed, 512)).toMatchObject({ count: 512, seed });
}, 30000);
it.each([0, 1])('FUZZ harness captures injected crash/stall %s before killing the child', async seed => {
  await expect(campaign(seed, 1, 0, { worker: '.tmp/fuzz/tests/fuzz/fault-worker.js', caseTimeoutMs: 100 })).rejects.toThrow('Fuzz failed');
  const artifact: unknown = JSON.parse(readFileSync(`.tmp/fuzz-failures/${seed}.json`, 'utf8'));
  expect(artifact).toMatchObject({ current: { seed, index: 0, text: 'known fixture' } });
  expect(artifact).toMatchObject(seed === 0 ? { code: 17 } : { failure: 'case timeout' });
});
