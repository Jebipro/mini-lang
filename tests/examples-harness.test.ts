import { expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverExamples, verifyOutput } from './helpers/examples.js';
it('T-EX-2 rejects missing and orphan expected files',()=>{
  for(const filename of ['01-test.lang','01-test.expected']){
    const directory=mkdtempSync(join(tmpdir(),'mini-lang-pairs-'));
    try{writeFileSync(join(directory,filename),'');expect(()=>discoverExamples(directory,0)).toThrow('pair');}
    finally{rmSync(directory,{recursive:true,force:true});}
  }
});
it('T-EX-2 preserves final newline and whitespace, normalizing only CRLF',()=>{
  expect(()=>verifyOutput('a\r\n','a\n')).not.toThrow();
  expect(()=>verifyOutput('a\n','a')).toThrow();expect(()=>verifyOutput('a \n','a\n')).toThrow();
  expect(()=>verifyOutput('','')).not.toThrow();expect(()=>verifyOutput('\n','')).toThrow();
});
