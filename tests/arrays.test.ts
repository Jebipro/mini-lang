import { expect, it } from 'vitest';
import { Interpreter } from '../src/interpreter.js';
import { Environment } from '../src/environment.js';
import { parse } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
import { formatValue } from '../src/value-format.js';
function run(text: string) { const env = new Environment(), p = parse(new SourceUnit(text)); new Interpreter().execute(p,env); return (name: string) => formatValue(env.get(name,p.span)); }
it('T-ARR-1 / T-ARR-3 / T-ARR-4 shares arrays and nested row references', () => {
  const get = run('let row=[0];let a=[row,row];let b=a;a[1][0]=5;let result=b[0][0];');
  expect(get('result')).toBe('5'); expect(get('a')).toBe('[[5], [5]]');
});
it('T-ASG-4 freezes the target reference before RHS rebinding', () => {
  const get=run('let a=[0];let old=a;a[0]=(a=[9]);let same=old[0]==a;let different=old==a;');
  expect(get('same')).toBe('true'); expect(get('different')).toBe('false');
});
it('T-ASG-3 core evaluates an index once', () => {
  const get=run('let a=[0];let i=-1;a[i=i+1]=(i=i+10);let result=a[0];');
  expect(get('i')).toBe('10'); expect(get('result')).toBe('10');
});
it.each(['a[-1];','a[2];','[][0];','a[2]=9;'])('T-IDX-1 bounds check %s', code => expect(() => run(`let a=[1,2];${code}`)).toThrow('out of bounds'));
it.each(['a[0.5];','a["0"];','a[true];','a[null];'])('T-IDX-2 type check %s', code => expect(() => run(`let a=[1];${code}`)).toThrow('integer number'));
it('T-IDX-2 fails base and target checks before index or RHS side effects', () => {
  expect(() => run('1[missing];')).toThrow('cannot index value of type number');
  expect(() => run('let a=[1];a[9]=missing;')).toThrow('out of bounds');
  expect(() => run('"abc"[0];')).toThrow('cannot index value of type string');
  expect(run('let a=[7];let result=a[-0];')('result')).toBe('7');
});
