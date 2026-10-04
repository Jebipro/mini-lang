import { expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChild } from '../helpers/child.js';
async function script(text:string) {
  const directory=mkdtempSync(join(tmpdir(),'mini-lang-cli-'));const path=join(directory,'space name.lang');
  try {writeFileSync(path,text);return await runChild(['dist/cli/run.js',path]);} finally {rmSync(directory,{recursive:true,force:true});}
}
it('T-CLI-1 executes UTF-8 scripts without expression echo',async()=>{
  expect(await script('print("안녕");1+2;')).toMatchObject({status:0,stdout:'안녕\n',stderr:'',timedOut:false});
});
it('T-CLI-1 reports parse/runtime/IO/usage failures with exit codes',async()=>{
  expect(await script('print(1);let x=;')).toMatchObject({status:1,stdout:''});
  expect((await script('print(1);missing;')).stderr).toContain('RuntimeError at');
  expect((await runChild(['dist/cli/run.js','no-such-file.lang'])).status).toBe(2);
  expect((await runChild(['dist/cli/run.js'])).status).toBe(2);
});
it('T-SAFE-1 / T-SAFE-3 guards recursion in a separate default-stack process',async()=>{
  const definition='fn f(n){if(n==0){return 0;}return f(n-1);}';
  expect(await script(definition+'print(f(63));')).toMatchObject({status:0,stdout:'0\n',timedOut:false});
  const excessive=await script(definition+'f(64);');
  expect(excessive.status).toBe(1);expect(excessive.stderr).toContain('maximum call depth (64) exceeded');expect(excessive.timedOut).toBe(false);
  const infinite=await script('fn f(){return f();}f();');expect(infinite.status).toBe(1);expect(infinite.timedOut).toBe(false);
});
it('T-RET-1 nested return terminates a bounded loop in an isolated process',async()=>{
  expect(await script('fn f(){let i=0;while(i<10){i=i+1;if(true){return 7;}}return 99;}print(f());')).toMatchObject({status:0,stdout:'7\n',timedOut:false});
});
