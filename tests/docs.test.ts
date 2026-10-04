import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runScript } from '../src/runner.js';
it('T-DOC-1 documents all deliverables and executes README language examples',()=>{
  for(const file of ['SPEC.md','ARCHITECTURE.md','GRAMMAR.md','README.md','LIMITATIONS.md','FUTURE.md','PROGRESS.md'])expect(readFileSync(file,'utf8').trim().length).toBeGreaterThan(100);
  const readme=readFileSync('README.md','utf8');
  const snippets=[...readme.matchAll(/```mini-lang\r?\n([\s\S]*?)```/g)];
  expect(snippets.length).toBeGreaterThanOrEqual(1);
  for(const snippet of snippets){let output='';runScript(snippet[1]??'','README',text=>{output+=text;});expect(output).not.toBe('');}
});
it('T-DOC-1 maps all forty risks and every designed test ID to test sources',()=>{
  function sources(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(join(directory,entry.name)):entry.name.endsWith('.test.ts')?[readFileSync(join(directory,entry.name),'utf8')]:[]);}
  const tests=sources('tests').join('\n'),design=readFileSync('DESIGN_REVIEW.md','utf8'),coverage=readFileSync('RISK_COVERAGE.md','utf8');
  const risks=[...design.matchAll(/^\| (R\d{2}) \|[^\r\n]+/gm)];expect(risks).toHaveLength(40);
  for(const risk of risks){expect(coverage).toContain(`| ${risk[1]} |`);for(const id of risk[0].match(/T-[A-Z]+-\d+/g)??[])expect(tests).toContain(id);}
  for(const definition of design.matchAll(/^\| (T-[A-Z]+-\d+) \|/gm))expect(tests).toContain(definition[1]);
  for(const link of coverage.matchAll(/\[(T-[A-Z]+-\d+)\]\((tests\/[^)]+)\)/g))expect(readFileSync(link[2]??'','utf8')).toContain(link[1]);
});
