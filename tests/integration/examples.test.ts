import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { discoverExamples, verifyOutput } from '../helpers/examples.js';
import { runChild } from '../helpers/child.js';
const examples=discoverExamples('examples');
it('T-EX-1 has at least fifteen paired programs',()=>expect(examples.length).toBeGreaterThanOrEqual(15));
it.each(examples)('T-EX-1 executes $name',async example=>{
  const result=await runChild(['dist/cli/run.js',example.program],5000);
  expect(result.status).toBe(0);expect(result.stderr).toBe('');expect(result.timedOut).toBe(false);
  verifyOutput(result.stdout,readFileSync(example.expected,'utf8'));
});
