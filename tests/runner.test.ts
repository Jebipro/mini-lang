import { expect, it } from 'vitest';
import { createSession, runSource } from '../src/runner.js';
import { SourceUnit } from '../src/source-location.js';
it('T-REPL-7 preflights collisions atomically and keeps runtime effects',()=>{
  let output=''; const session=createSession(text=>{output+=text;});
  expect(()=>runSource(new SourceUnit('let a=1;let b=1/0;'),session)).toThrow('division by zero');
  runSource(new SourceUnit('print(a);'),session);expect(output).toBe('1\n');
  expect(()=>runSource(new SourceUnit('b;'),session)).toThrow('before initialization');
  expect(()=>runSource(new SourceUnit('let fresh=1;let a=2;'),session)).toThrow('already declared');
  expect(()=>runSource(new SourceUnit('fresh;'),session)).toThrow('undefined variable');
});
