import { expect, it, vi } from 'vitest';
import { SourceUnit } from '../src/source-location.js';
import { classify, parse } from '../src/parser.js';
import { createSession, runSource, runScript } from '../src/runner.js';
import { LangError } from '../src/errors.js';
import { Repl } from '../src/repl.js';
import { runChild } from './helpers/child.js';

function output(text: string): string {
  let result = '';
  runScript(text, 'adversarial.lang', chunk => { result += chunk; });
  return result;
}

it.each(['<source>', 'same.lang'])('ADV-01 gives distinct source units unique default IDs: %s', name => {
  const first = new SourceUnit('let x=1;', name);
  const second = new SourceUnit('let x=2;', name);
  expect(first.id).not.toBe(second.id);
  expect(first.displayName).toBe(name);
  expect(second.displayName).toBe(name);
});

it('ADV-01 preserves an explicitly supplied source ID', () => {
  expect(new SourceUnit('1;', 'display', 'caller-owned-id').id).toBe('caller-owned-id');
});

it('ADV-01 retains a pending submission ID across reparses but isolates REPL sessions', () => {
  const ids: string[] = [];
  const position = SourceUnit.prototype.position;
  const spy = vi.spyOn(SourceUnit.prototype, 'position').mockImplementation(function (this: SourceUnit, offset) {
    if (this.displayName === '<repl:1>') ids.push(this.id);
    return position.call(this, offset);
  });
  try {
    const ports = { writeOutput: () => {}, writeDiagnostic: () => {}, showPrompt: () => {} };
    const first = new Repl(ports);
    first.submitLine('fn f(){');
    const pendingId = ids[0];
    expect(pendingId).toBeDefined();
    first.submitLine('}');
    expect(new Set(ids).size).toBe(1);
    ids.length = 0;
    new Repl(ports).submitLine('1');
    expect(ids[0]).not.toBe(pendingId);
  } finally { spy.mockRestore(); }
});

it.each(['stdout', 'stderr'])('ADV-02 preserves UTF-8 across child %s chunks', async stream => {
  const script = `const bytes=Buffer.from('한😀글\\n');process.${stream}.write(bytes.subarray(0,1));setTimeout(()=>process.${stream}.write(bytes.subarray(1)),250);`;
  const result = await runChild(['-e', script], 3000);
  expect(result).toEqual({ status: 0, stdout: stream === 'stdout' ? '한😀글\n' : '', stderr: stream === 'stderr' ? '한😀글\n' : '', timedOut: false });
});

it('ADV-03 freezes the callable before an argument rebinds its name', () => {
  expect(output('fn f(a){return 1;}fn g(a){return 2;}print(f(f=g),f(null));')).toBe('1 2\n');
});

it('ADV-04 freezes array base before an index expression rebinds it', () => {
  expect(output('let a=[3];let old=a;fn index(){a=[9];return 0;}a[index()]=7;print(old,a);')).toBe('[7] [9]\n');
});

it('ADV-05 retains operand references while later operands mutate shared arrays', () => {
  expect(output('let a=[0];fn mutate(){a[0]=8;return a;}print(a,mutate(),a==mutate());')).toBe('[8] [8] true\n');
});

it('ADV-06 evaluates arguments before rejecting the 65th user call and restores depth', () => {
  let result = '';
  const session = createSession(chunk => { result += chunk; });
  // A finite base case keeps the regression safe even if the call guard disappears.
  runSource(new SourceUnit('let seen=0;fn f(n){if(n==0){return 0;}return f(n-1+(seen=seen+1)*0);}'), session);
  try { runSource(new SourceUnit('f(64);'), session); expect.fail('expected call depth error'); }
  catch (error) { expect(error).toBeInstanceOf(LangError); expect(error).toMatchObject({ code: 'E_CALL_DEPTH' }); }
  runSource(new SourceUnit('print(seen);fn ok(){return 7;}print(ok());'), session);
  expect(result).toBe('64\n7\n');
});

it('ADV-07 rejects a later global collision before hoisting, output or fresh reservation', () => {
  let result = '';
  const session = createSession(chunk => { result += chunk; });
  runSource(new SourceUnit('let old=1;'), session);
  expect(() => runSource(new SourceUnit('print(99);fn fresh(){return 2;}let old=3;'), session)).toThrow('already declared');
  expect(result).toBe('');
  expect(session.global.hasOwn('fresh')).toBe(false);
  runSource(new SourceUnit('print(old);'), session);
  expect(result).toBe('1\n');
});

it('ADV-08 shares parameter mutation between sibling closures after return', () => {
  expect(output('fn make(n){fn set(x){n=x;}fn get(){return n;}return [set,get];}let pair=make(1);pair[0](9);print(pair[1]());')).toBe('9\n');
});

it('ADV-09 keeps caller mutation when a later argument fails and skips the body', () => {
  let result = '';
  const session = createSession(chunk => { result += chunk; });
  runSource(new SourceUnit('let a=0;fn f(x,y){print(99);}'), session);
  expect(() => runSource(new SourceUnit('f(a=1,missing);'), session)).toThrow('undefined variable');
  runSource(new SourceUnit('print(a);'), session);
  expect(result).toBe('1\n');
});

it('ADV-10 preserves UTF-16 anchors after BOM, CRLF, emoji and tabs', () => {
  const source = new SourceUnit('\uFEFFlet s="😀";\r\n\t[0][(2)];', 'unicode.lang');
  try { runSource(source, createSession(() => {})); expect.fail('expected index failure'); }
  catch (error) { expect(error).toMatchObject({ code: 'E_INDEX_RANGE', span: { source, start: { offset: 19, line: 2, column: 6 } } }); }
});

it('ADV-11 resets parse context after rejecting a duplicate nested parameter', () => {
  const diagnostics: string[] = [], outputs: string[] = [];
  const repl = new Repl({ writeOutput: text => outputs.push(text), writeDiagnostic: text => diagnostics.push(text), showPrompt: () => {} });
  repl.submitLine('fn outer(){fn inner(a,a');
  repl.submitLine('return 1;');
  repl.submitLine('2');
  expect(diagnostics).toHaveLength(2);
  expect(diagnostics[0]).toContain('duplicate parameter');
  expect(diagnostics[1]).toContain('return is only allowed inside a function');
  expect(outputs).toEqual(['2\n']);
});

it('ADV-12 bounds sibling syntax independently and rejects excessive postfix height', () => {
  const grouped = '('.repeat(64) + '1' + ')'.repeat(64);
  expect(() => parse(new SourceUnit(grouped + ';' + grouped + ';'))).not.toThrow();
  expect(() => parse(new SourceUnit('f' + '()'.repeat(125) + ';'))).not.toThrow();
  expect(() => parse(new SourceUnit('f' + '()'.repeat(126) + ';'))).toThrow('AST depth limit');
  expect(classify(new SourceUnit('f' + '()'.repeat(126))).kind).toBe('invalid');
});

it('ADV-13 distinguishes remainder/negative zero and rejects arithmetic overflow', () => {
  expect(output('print(-0,0==-0,-5%2,5%-2,1/2);')).toBe('0 true -1 1 0.5\n');
  const finite = '1' + '0'.repeat(308);
  expect(() => output(`print(${finite}*10);`)).toThrow('numeric result is not finite');
});

it('ADV-14 checks 432 arithmetic triples against independent precedence oracles', () => {
  const ops = [
    { text: '+', priority: 1, apply: (a: number, b: number) => a + b },
    { text: '-', priority: 1, apply: (a: number, b: number) => a - b },
    { text: '*', priority: 2, apply: (a: number, b: number) => a * b },
    { text: '%', priority: 2, apply: (a: number, b: number) => a % b }
  ];
  for (const a of [-2, 1, 3]) for (const b of [-2, 1, 3]) for (const c of [-2, 1, 3]) {
    for (const left of ops) for (const right of ops) {
      const expected = left.priority < right.priority ? left.apply(a, right.apply(b, c)) : right.apply(left.apply(a, b), c);
      // These inputs never divide by zero: modulo's right operand is a nonzero literal.
      expect(output(`print(${a}${left.text}${b}${right.text}${c});`)).toBe(String(expected) + '\n');
    }
  }
});
