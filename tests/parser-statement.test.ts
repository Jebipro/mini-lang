import { expect, it } from 'vitest';
import { parse, classify } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
const source = (text: string) => new SourceUnit(text);
it('parses all statements and nested function return context', () => {
  expect(parse(source('let x=1; fn f(a){while(a){if(a){return a;}else {return;}}} {x=2;}')).statements.map(s => s.kind)).toEqual(['Let','Function','Block']);
});
it.each(['return 1;', '{return;}', 'fn f(a,a){}', 'fn f(a){let a=1;}', 'let x=1;let x=2;', 'if(true) 1;', ';', 'fn f(){};'])('T-SCOPE-4 / T-RET-3 rejects %s', text => expect(() => parse(source(text))).toThrow());
it.each(['fn f(', 'let x =', 'while(true)', '{', 'f(1,', 'let x=1', '1+', 'if(true){} else'])('T-PARSE-1 / T-REPL-4 incomplete %s', text => expect(classify(source(text)).kind).toBe('incomplete'));
it.each(['}', 'let x=;', '1 2', '[1,]', 'f(1,)', 'a[]', '1+2 =', '"abc', 'else{}'])('T-REPL-4 invalid %s', text => expect(classify(source(text)).kind).toBe('invalid'));
it.each(['', '// note', '1+2', 'let x=1;', 'fn f(){}', 'print("[");', 'if(true){}'])('T-REPL-4 complete %s', text => expect(classify(source(text)).kind).toBe('complete'));
it('T-SAFE-5 syntax and full AST limits stop deep input', () => {
  expect(() => parse(source('('.repeat(64)+'1'+')'.repeat(64)+';'))).not.toThrow();
  expect(() => parse(source('('.repeat(65)+'1'+')'.repeat(65)+';'))).toThrow('syntax nesting limit');
  expect(() => parse(source(Array(126).fill('1').join('+')+';'))).not.toThrow();
  expect(() => parse(source(Array(127).fill('1').join('+')+';'))).toThrow('AST depth limit');
});
