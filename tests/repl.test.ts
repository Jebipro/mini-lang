import { expect, it } from 'vitest';
import { Repl } from '../src/repl.js';
function repl() {const out:string[]=[],errors:string[]=[],prompts:string[]=[];const core=new Repl({writeOutput:t=>out.push(t),writeDiagnostic:t=>errors.push(t),showPrompt:t=>prompts.push(t)});return {core,out,errors,prompts};}
it('T-REPL-1 / T-REPL-2 persists values and closures across errors',()=>{
  const r=repl();for(const line of ['let x=1;','x=x+1','missing','x','fn make(){let n=0;fn c(){n=n+1;return n;}return c;}','let c=make();','c()','missing','c()'])r.core.submitLine(line);
  expect(r.out).toEqual(['2\n','2\n','1\n','2\n']);expect(r.errors).toHaveLength(2);expect(r.core.endInput()).toBe(0);
});
it('T-REPL-3 / T-REPL-4 waits for a full parse then executes once',()=>{
  const r=repl();r.core.submitLine('print(1); fn f(){');expect(r.out).toEqual([]);expect(r.prompts.at(-1)).toBe('... ');
  r.core.submitLine('}');expect(r.out).toEqual(['1\n']);r.core.submitLine('print(2);let x=;');expect(r.out).toEqual(['1\n']);expect(r.errors).toHaveLength(1);
});
it('T-REPL-5 injects ports, handles cancellation and incomplete EOF',()=>{
  const r=repl();r.core.submitLine('fn f(){');r.core.cancelInput();r.core.submitLine('1+2');expect(r.out).toEqual(['3\n']);r.core.submitLine('let x=');expect(r.core.endInput()).toBe(1);expect(r.errors[0]).toContain('SyntaxError');
});
it('T-REPL-6 preserves old function source in later diagnostics',()=>{
  const r=repl();r.core.submitLine('fn f(){return 1+"x";}');r.core.submitLine('f()');expect(r.errors[0]).toContain('<repl:1>:1:16');
});
it('T-REPL-7 retains partial runtime effects and TDZ reservations',()=>{
  const r=repl();for(const line of ['let a=1;let b=1/0;','a','b','b=2;','let b=2;','4'])r.core.submitLine(line);
  expect(r.out).toEqual(['1\n','4\n']);expect(r.errors).toHaveLength(4);
});
it('echoes only top-level non-null expressions and accepts multiline operators',()=>{
  const r=repl();for(const line of ['1;2;','print(3);','null','{4;}','1+','2'])r.core.submitLine(line);
  expect(r.out).toEqual(['1\n','2\n','3\n','3\n']);
});
