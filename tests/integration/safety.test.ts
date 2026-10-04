import { expect, it } from 'vitest';
import { runChild } from '../helpers/child.js';
const prelude = `import {runSource,createSession} from './dist/runner.js';import {SourceUnit} from './dist/source-location.js';import {LangError} from './dist/errors.js';const s=createSession(t=>process.stdout.write(t));function run(text){runSource(new SourceUnit(text,'safety'),s);}`;
it('T-SAFE-5 / T-SAFE-4 evaluation limit precedes host overflow and resets',async()=>{
  const source='fn f(n){if(true){if(true){if(true){if(n==0){return 0;}return f(n-1);}}}}f(63);';
  const script=prelude+`try{run(${JSON.stringify(source)});}catch(e){if(!(e instanceof LangError))throw e;console.log(e.code);}run('print(f(1));');`;
  expect(await runChild(['--input-type=module','-e',script])).toMatchObject({status:0,stdout:'E_EVAL_DEPTH\n0\n',stderr:'',timedOut:false});
});
it('T-SAFE-1 guards non-tail recursion and nested control flow on the default stack',async()=>{
  const script=prelude+`run('fn f(n){if(n==0){return 0;}return 1+f(n-1);}print(f(63));');try{run('f(64);');}catch(e){if(!(e instanceof LangError))throw e;console.log(e.code);}`;
  expect(await runChild(['--input-type=module','-e',script])).toMatchObject({status:0,stdout:'63\nE_CALL_DEPTH\n',stderr:'',timedOut:false});
});
it('T-PARSE-1 / T-SAFE-3 terminates malformed/deep parsing in a child',async()=>{
  const script=prelude+`for(const text of ['}', 'fn f(', '('.repeat(10000)]){try{run(text);}catch(e){if(!(e instanceof LangError))throw e;console.log(e.kind);}}`;
  expect(await runChild(['--input-type=module','-e',script])).toMatchObject({status:0,stdout:'SyntaxError\nSyntaxError\nSyntaxError\n',timedOut:false});
});
