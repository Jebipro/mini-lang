import { expect, it } from 'vitest';
import { Interpreter } from '../src/interpreter.js';
import { Environment } from '../src/environment.js';
import { parse } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
import { formatValue } from '../src/value-format.js';
import { NULL } from '../src/runtime-values.js';
const counter='fn make(){let n=0;fn inc(){n=n+1;return n;}fn get(){return n;}return [inc,get];}';
it('T-SAFE-2 translates a host limit at the outer execution boundary',()=>{
  class FailingEnvironment extends Environment { override reserve():void {throw new RangeError('scope allocation');} }
  try {new Interpreter().execute(parse(new SourceUnit('let x=1;')),new FailingEnvironment());expect.fail('expected limit');}
  catch(error){expect(error).toMatchObject({code:'E_HOST_LIMIT',cause:expect.any(RangeError)});}
});
function session() { const env=new Environment(), interpreter=new Interpreter(); return {env,interpreter,run(text:string){const p=parse(new SourceUnit(text));interpreter.execute(p,env);return (name:string)=>formatValue(env.get(name,p.span));}}; }
it('T-CLOS-1 / T-CLOS-2 / T-CLOS-3 shares sibling state but separates factory calls', () => {
  const get=session().run(counter+'let a=make();let b=make();a[0]();a[0]();b[0]();let r=[a[1](),b[1]()];'); expect(get('r')).toBe('[2, 1]');
});
it('T-SCOPE-1 captures declaration environment, not caller', () => {
  const get=session().run('let x=1;fn f(){return x;}fn g(){let x=2;return f();}let r=g();'); expect(get('r')).toBe('1');
});
it('T-SCOPE-3 hoists the local binding with TDZ', () => {
  expect(()=>session().run('let a="outer";{fn f(){return a;}f();let a="inner";}')).toThrow('before initialization');
  expect(session().run('let r=null;{fn f(){return a;}let a="inner";r=f();}')('r')).toBe('inner');
});
it('T-REC-1 / T-REC-2 supports factorial and mutual hoisted recursion', () => {
  const get=session().run('let r=fact(5);fn fact(n){if(n==0){return 1;}return n*fact(n-1);}fn even(n){if(n==0){return true;}return odd(n-1);}fn odd(n){if(n==0){return false;}return even(n-1);}let e=even(10);');
  expect(get('r')).toBe('120');expect(get('e')).toBe('true');
});
it('T-RET-1 / T-RET-2 / T-RET-3 / T-RET-4 propagates nested returns and consumes at the right call', () => {
  const get=session().run('fn f(){let i=0;while(i<3){i=i+1;if(i==2){{return i;}}}return 9;}fn outer(){fn inner(){return 2;}inner();return 3;}fn empty(){}fn bare(){return;}let r=[f(),outer(),empty(),bare()];');
  expect(get('r')).toBe('[2, 3, null, null]');
});
it('T-CALL-1 / T-CALL-2 rejects arity/non-callables before arguments', () => {
  expect(()=>session().run('fn f(a){return a;}f();')).toThrow('expects 1 arguments but got 0');
  expect(()=>session().run('fn f(a){return a;}f(missing,missing);')).toThrow('expects 1 arguments but got 2');
  expect(()=>session().run('1(missing);')).toThrow('not callable');
});
it('T-CALL-3 permits mixed postfix chains', () => {
  const get=session().run('fn make(x){fn add(y){return x+y;}return add;}fn arr(x){return [x];}let a=[make(3)];let r=[make(1)(2),a[0](4),arr(9)[0]];'); expect(get('r')).toBe('[3, 7, 9]');
});
it('T-ARR-2 / T-ASG-3 mutates array arguments and evaluates index calls once', () => {
  const get=session().run('let a=[0];let i=0;fn idx(){i=i+1;return 0;}a[idx()]=(i=i+10);fn set(a){a[0]=7;}let r=i;set(a);'); expect(get('r')).toBe('11');expect(get('a')).toBe('[7]');
});
it('T-SAFE-1 / T-SAFE-4 permits 64 user calls and recovers after depth and body errors', () => {
  const s=session();s.run('fn f(n){if(n==0){return 0;}return f(n-1);}');
  expect(s.run('let a=f(62);let b=f(63);')('b')).toBe('0');
  expect(()=>s.run('f(64);')).toThrow('maximum call depth (64) exceeded');
  expect(()=>s.run('1+"a";')).toThrow('cannot be applied');
  expect(s.run('let c=f(3);')('c')).toBe('0');
});
it('T-SAFE-2 converts native RangeError but preserves other host and language errors', () => {
  const s=session(), span=new SourceUnit('native').span(0);
  s.env.reserve('native',span);s.env.initialize('native',{tag:'builtin',name:'native',arity:{min:0,max:0},invoke:()=>{throw new RangeError('host');}});
  expect(()=>s.run('native();')).toThrow('host runtime limit exceeded');
  try { s.run('native();'); expect.fail('expected native limit error'); }
  catch(error) { expect(error).toMatchObject({code:'E_HOST_LIMIT',cause:expect.any(RangeError),span:{start:{column:7}}}); }
  s.env.assign('native',{tag:'builtin',name:'native',arity:{min:0,max:0},invoke:()=>{throw new Error('host bug');}},span);
  expect(()=>s.run('native();')).toThrow('host bug');
  s.env.assign('native',{tag:'builtin',name:'native',arity:{min:0,max:0},invoke:()=>NULL},span);
  expect(()=>s.run('native();')).not.toThrow();
});
