import { expect, expectTypeOf, it } from 'vitest';
import { classify, parse } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
import { createSession, runSource, runScript } from '../src/runner.js';
import { LangSyntaxError, LangTypeError } from '../src/errors.js';
import { primitive, type RuntimeValue } from '../src/runtime-values.js';
import type { Expr } from '../src/ast.js';
function output(text:string):string{let out='';runScript(text,'regression',t=>{out+=t;});return out;}
it.each(['let x=1;let x=', 'fn f(a,a', 'fn f(a){let a='])('T-SCOPE-4 / T-REPL-4 rejects an already-invalid duplicate prefix %s', text=>{
  const result=classify(new SourceUnit(text));expect(result.kind).toBe('invalid');if(result.kind!=='complete')expect(result.error.code).toBe('E_DUPLICATE');
});
it('T-LOG-3 returns operand values and tags rather than booleans',()=>{
  const session=createSession(()=>{}),source=new SourceUnit('let a=null||"x";let b=0&&9;let c=""||5;let d=[]&&7;');
  runSource(source,session);expect(session.global.get('a',source.span(0))).toEqual(primitive('x'));expect(session.global.get('b',source.span(0))).toEqual(primitive(9));expect(session.global.get('c',source.span(0))).toEqual(primitive(''));expect(session.global.get('d',source.span(0))).toEqual(primitive(7));
});
it('T-STATIC-2 AST assignments restrict targets and runtime unions narrow safely',()=>{
  expectTypeOf<Extract<Expr,{kind:'Assign'}>['target']['kind']>().toEqualTypeOf<'Identifier'|'Index'>();
  const value:RuntimeValue=primitive(1);
  // @ts-expect-error A non-exhaustive runtime branch cannot be assigned to never.
  const omitted:never=value;
  expect(omitted).toEqual(primitive(1));
});
it('T-VAL-2 distinguishes function identities and observes name rebinding',()=>{
  expect(output('fn f(){return f;}let g=f;fn h(){return 9;}print(f==g,f==h,f==len);f=h;print(g()==h);')).toBe('true false false\ntrue\n');
});
it('T-CLOS-2 loop iterations allocate independent captured cells',()=>{
  expect(output('let a=[null,null];let i=0;while(i<2){let n=i;fn f(){return n;}a[i]=f;i=i+1;}print(a[0](),a[1]());')).toBe('0 1\n');
});
it('T-ASG-1 / T-ASG-3 / T-ASG-4 / T-ARR-3 execute the complete output fixtures',()=>{
  expect(output('let a=0;let b=0;print(a=b=3,a,b);let c=[0];print(a=c[0]=8);')).toBe('3 3 3\n8\n');
  expect(output('let a=[0];let i=0;fn idx(){i=i+1;return 0;}a[idx()]=(i=i+10);print(i,a[0]);')).toBe('11 11\n');
  expect(output('let a=[0];let old=a;a[0]=(a=[9]);print(old[0]==a,old==a);')).toBe('true false\n');
  expect(output('let a=[[1,2],[3]];a[0][1]=9;print(a);')).toBe('[[1, 9], [3]]\n');
});
it('T-RET-3 / T-RET-4 preserves newline return and nested call boundaries',()=>{
  expect(output('fn f(){return\n1;}fn outer(){fn inner(){return 2;}inner();return 3;}print(f(),outer());')).toBe('1 3\n');
  expect(()=>parse(new SourceUnit('if(true){return 1;}'))).toThrow(LangSyntaxError);
});
it('T-REC-1 checks recursion bases and recursive Fibonacci',()=>{
  expect(output('fn fact(n){if(n==0){return 1;}return n*fact(n-1);}fn fib(n){if(n<=1){return n;}return fib(n-1)+fib(n-2);}print(fact(0),fact(5),fib(0),fib(1),fib(6));')).toBe('1 120 0 1 8\n');
});
it('T-LOG-2 observable function side effects occur only on selected RHS',()=>{
  expect(output('fn rhs(){print(9);return 8;}false&&rhs();true||rhs();true&&rhs();false||rhs();')).toBe('9\n9\n');
});
it('T-NUM-1 / T-LOC-3 evaluates both binary operands before type checking',()=>{
  let out='';expect(()=>runScript('null+print(1);','source',t=>{out+=t;})).toThrow(LangTypeError);expect(out).toBe('1\n');
});
it('T-REPL-7 exposes later global declarations to existing closures',()=>{
  let out='';const s=createSession(t=>{out+=t;});runSource(new SourceUnit('fn f(){return future;}'),s);
  expect(()=>runSource(new SourceUnit('f();'),s)).toThrow('undefined variable');runSource(new SourceUnit('let future=3;print(f());'),s);expect(out).toBe('3\n');
});
it('T-SAFE-5 limits unary, assignment and block nesting',()=>{
  for(const text of ['!'.repeat(65)+'true;', 'a='.repeat(65)+'0;', '{'.repeat(65)+'}'.repeat(65)])expect(()=>parse(new SourceUnit(text))).toThrow('syntax nesting limit');
});
