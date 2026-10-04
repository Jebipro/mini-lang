import { expect, it } from 'vitest';
import { createBuiltins } from '../src/builtins.js';
import { Environment } from '../src/environment.js';
import { Interpreter } from '../src/interpreter.js';
import { parse } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
import { LangError } from '../src/errors.js';
function run(text:string) {
  let output='';const source=new SourceUnit(text,'test.lang'), parent=new Environment();
  for (const builtin of createBuiltins(chunk=>{output+=chunk;})) {parent.reserve(builtin.name,source.span(0),false);parent.initialize(builtin.name,builtin);}
  new Interpreter().execute(parse(source),new Environment(parent));return output;
}
it('T-BI-1 implements print and len including UTF-16 length and null return',()=>{
  expect(run('print();print(1,"x",null);print(len([]),len(""),len("😀"));print(print(2));')).toBe('\n1 x null\n0 0 2\n2\nnull\n');
});
it('T-BI-2 treats builtins as first class readonly parents with shadowing',()=>{
  expect(run('let p=print;p(1);print(p==print);')).toBe('1\ntrue\n');
  expect(run('let print=3;')).toBe('');expect(()=>run('print=3;')).toThrow('read-only');
});
it.each(['len();','len([],[]);','len(1);'])('T-BI-1 rejects %s',text=>expect(()=>run(text)).toThrow());
it('T-CALL-2 checks arity before arguments, then evaluates valid arguments left to right',()=>{
  expect(()=>run('fn f(a){return a;}f(missing,missing);')).toThrow('expects 1 arguments');
  expect(run('fn f(a,b){}f(print(1),print(2));')).toBe('1\n2\n');
});
it('T-FMT-1 formats circular arrays and functions',()=>{
  expect(run('let a=[null];a[0]=a;fn f(){}print(a,f,len);')).toBe('[<cycle>] <fn f> <builtin len>\n');
});
it.each([
  ['let x=0;\nmissing;', 'E_UNDEFINED',2,1],
  ['fn f(){\n  return 1 + "x";\n}\nf();','E_OPERAND',2,12],
  ['let a=[1];\na[2];','E_INDEX_RANGE',2,3],
  ['1();','E_NOT_CALLABLE',1,2],['len(1);','E_LEN_TYPE',1,4]
])('T-LOC-3 / T-LOC-4 %s',(text,code,line,column)=>{
  try {run(text);expect.fail('expected language error');}catch(error){expect(error).toBeInstanceOf(LangError);expect(error).toMatchObject({code,span:{start:{line,column}}});}
});
