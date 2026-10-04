import { expect, it } from 'vitest';
import { Interpreter } from '../src/interpreter.js';
import { Environment } from '../src/environment.js';
import { parse } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
import { primitive } from '../src/runtime-values.js';
function run(text: string) { const env = new Environment(); const interpreter = new Interpreter(); const program = parse(new SourceUnit(text)); interpreter.execute(program, env); return { env, interpreter, span: program.span }; }
it.each([['1+2*3',7],['(1+2)*3',9],['10-3-2',5],['8/2*2',8],['1+2<4==true',true],['true || false && false',true],['-2*3',-6],['!0',false]])('T-PREC-1 / T-PREC-2 %s', (expression, result) => {
  const {env,span} = run(`let result=${expression};`); expect(env.get('result',span)).toEqual(primitive(result));
});
it('T-ASG-1 / T-SCOPE-2 / T-LOG-2 propagates assignment values and short circuit effects', () => {
  const {env,span} = run('let a=0; let b=0; a=b=3; {let a=9;} false&&(a=4); true||(a=5); true&&(b=6);');
  expect(env.get('a',span)).toEqual(primitive(3)); expect(env.get('b',span)).toEqual(primitive(6));
});
it('T-LOG-1 avoids undefined names and division by zero on unselected branches', () => {
  expect(() => run('false && missing; true || missing; null && (1/0);')).not.toThrow();
});
it('while iterates with fresh block scopes', () => {
  const {env,span} = run('let i=0;let sum=0;while(i<5){let n=i+1;sum=sum+n;i=i+1;}');
  expect(env.get('sum',span)).toEqual(primitive(15));
});
it('T-SCOPE-4 detects TDZ before an outer binding and initializer self-read', () => {
  expect(() => run('let x=1;{x;let x=2;}')).toThrow('before initialization');
  expect(() => run('let x=x;')).toThrow('before initialization');
});
it('T-NUM-1 rejects unsupported operands and comparison chains', () => {
  for (const code of ['-true;','1+"a";','"a"<"b";','1<2<3;']) expect(() => run(code)).toThrow();
});
