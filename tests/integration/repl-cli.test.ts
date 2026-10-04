import { expect, it } from 'vitest';
import { runChild } from '../helpers/child.js';
it('REPL adapter accepts piped input without prompts and survives errors',async()=>{
  const result=await runChild(['dist/cli/repl.js'],2000,'let x=1;\nx+1\nmissing\nx+2\n');
  expect(result).toMatchObject({status:0,stdout:'2\n3\n',timedOut:false});expect(result.stderr).toContain('undefined variable');
});
it('REPL adapter returns 1 for incomplete input at EOF',async()=>{
  const result=await runChild(['dist/cli/repl.js'],2000,'fn f(){\n');
  expect(result).toMatchObject({status:1,stdout:'',timedOut:false});expect(result.stderr).toContain('SyntaxError at <repl:1>');
});
