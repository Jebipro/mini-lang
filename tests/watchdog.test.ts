import { expect, it } from 'vitest';
import { runChild } from './helpers/child.js';
it('T-SAFE-3 bounds a finite slow child without hanging the suite', async () => {
  const result = await runChild(['-e', 'setTimeout(() => {}, 10000)'], 100);
  expect(result.timedOut).toBe(true);
});
it('captures successful child output and status', async () => {
  const result = await runChild(['-e', 'process.stdout.write("ok")']);
  expect(result).toMatchObject({ status: 0, stdout: 'ok', stderr: '', timedOut: false });
});
