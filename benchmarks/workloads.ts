import assert from 'node:assert/strict';
import { lex } from '../src/lexer.js';
import { Parser } from '../src/parser.js';
import { SourceUnit } from '../src/source-location.js';
import { compile, createSession, execute } from '../src/runner.js';
import { Repl } from '../src/repl.js';
import { LangError } from '../src/errors.js';

export interface Definition { id: string; group: string; size: number; variant: string }
export interface Workload {
  batch: number;
  units: number;
  unit: string;
  details: Record<string, number | string>;
  prepare(): () => number;
  expected: number;
}
export function definitions(): Definition[] {
  const result: Definition[] = [];
  function add(group: string, variant: string, sizes: number[]): void {
    for (const size of sizes) result.push({ id: `${group}/${variant}/${size}`, group, variant, size });
  }
  add('lexer', 'mixed', [1000, 10000, 100000]);
  for (const variant of ['expression', 'statement', 'function']) add('lexer', variant, [100, 1000, 10000]);
  for (const variant of ['expression', 'statement', 'function']) add('parser', variant, [100, 1000, 10000]);
  add('interpreter', 'arithmetic', [10000, 100000]);
  add('interpreter', 'function', [10000, 100000]);
  add('interpreter', 'factorial', [1000]);
  add('interpreter', 'fibonacci', [20]);
  for (const variant of ['traversal', 'mutation']) add('interpreter', variant, [1000, 10000, 100000]);
  for (const group of ['compile', 'execute', 'pipeline']) for (const variant of ['arithmetic', 'control', 'function', 'traversal']) add(group, variant, [10000]);
  for (const variant of ['fixed', 'prepopulated', 'growing']) add('repl', variant, [100, 1000]);
  for (const variant of ['lexer', 'parser', 'undefined', 'type', 'bounds']) add('error', variant, [100]);
  return result;
}
function dimensions(text: string): Record<string, number> {
  return { chars: text.length, bytes: Buffer.byteLength(text, 'utf8'), lines: text.split('\n').length };
}
function parserSource(variant: string, count: number): string {
  return Array.from({ length: count }, (_, i) => {
    if (variant === 'expression') return '(1+2*3<9 && true)||false; [1,2,3][1]; make(1)[0](2);';
    if (variant === 'statement') return `{let x${i}=0; x${i}=x${i}+1; if(x${i}<3){x${i}=2;}else{x${i}=3;} while(x${i}<5){x${i}=x${i}+1;}}`;
    return `fn outer${i}(a){let n=a;fn inner(b){{n=n+b;}return n;}return inner;}outer${i}(1)(2);`;
  }).join('\n');
}
function runtimeSource(variant: string, n: number): { text: string; expected: number } {
  if (variant === 'arithmetic') return { text: `let i=0;let sum=0;while(i<${n}){sum=sum+1;i=i+1;}print(sum);`, expected: n };
  if (variant === 'function') return { text: `fn inc(x){return x+1;}let i=0;let sum=0;while(i<${n}){sum=inc(sum);i=i+1;}print(sum);`, expected: n };
  if (variant === 'control') return { text: `let i=0;let sum=0;while(i<${n}){if(i%2==0){sum=sum+1;}else{sum=sum+2;}i=i+1;}print(sum);`, expected: n * 1.5 };
  if (variant === 'factorial') return { text: `fn fact(n){if(n==0){return 1;}return n*fact(n-1);}let i=0;let sum=0;while(i<${n}){sum=sum+fact(12);i=i+1;}print(sum);`, expected: n * 479001600 };
  if (variant === 'fibonacci') return { text: `fn fib(n){if(n<2){return n;}return fib(n-1)+fib(n-2);}print(fib(${n}));`, expected: 6765 };
  const values = Array.from({ length: n }, (_, i) => variant === 'mutation' ? 0 : i).join(',');
  if (variant === 'mutation') return { text: `let a=[${values}];let i=0;while(i<${n}){a[i]=i;i=i+1;}print(a[${n - 1}]);`, expected: n - 1 };
  return { text: `let a=[${values}];let i=0;let sum=0;while(i<len(a)){sum=sum+a[i];i=i+1;}print(sum);`, expected: n * (n - 1) / 2 };
}
export function workload(definition: Definition): Workload {
  const { group, variant, size } = definition;
  if (group === 'lexer') {
    const patterns = ['let value=12.5+2*3; // number', 'let text="한글"; let a=[1,2,3];', 'fn f(x){return x+1;}', 'if(true && 1<2){f(a[0]);}else{null;}', 'while(false){value=value-1;}'];
    const text = variant === 'mixed' ? Array.from({ length: size }, (_, i) => patterns[i % patterns.length]).join('\n') : parserSource(variant, size);
    const source = new SourceUnit(text), count = lex(source).length;
    return { batch: 1, units: count, unit: 'tokens', details: { ...dimensions(text), tokens: count }, expected: count, prepare: () => () => lex(source).length };
  }
  if (group === 'parser') {
    const text = parserSource(variant, size), tokens = lex(new SourceUnit(text));
    const statements = size * (variant === 'expression' ? 3 : variant === 'function' ? 2 : 1);
    return { batch: 1, units: tokens.length, unit: 'tokens', details: { ...dimensions(text), tokens: tokens.length, topLevelStatements: statements, blocks: size }, expected: statements, prepare: () => () => new Parser(tokens).program().statements.length };
  }
  if (group === 'repl') {
    const submissions = Array.from({ length: size }, (_, i) => variant === 'growing' ? `let v${i}=x+1;x=v${i};` : 'x=x+1;');
    const setup = 'let x=0;' + (variant === 'prepopulated' ? Array.from({ length: 10000 }, (_, i) => `let prior${i}=0;`).join('') : '');
    return { batch: 1, units: size, unit: 'submissions', details: { submissions: size, globalsBefore: variant === 'prepopulated' ? 10001 : 1, globalsAfter: variant === 'prepopulated' ? 10001 : variant === 'growing' ? size + 1 : 1 }, expected: size, prepare() {
      let last = 0;
      const core = new Repl({ writeOutput: text => { last = Number(text); }, writeDiagnostic: text => { throw new Error(text); }, showPrompt: () => {} });
      core.submitLine(setup);
      return () => { for (const text of submissions) core.submitLine(text); return last; };
    } };
  }
  if (group === 'error') {
    const text = variant === 'lexer' ? '"\\q";' : variant === 'parser' ? 'let x=;' : variant === 'undefined' ? 'missing;' : variant === 'type' ? '1+"x";' : '[0][1];';
    const code = variant === 'lexer' ? 'E_ESCAPE' : variant === 'parser' ? 'E_EXPECTED' : variant === 'undefined' ? 'E_UNDEFINED' : variant === 'type' ? 'E_OPERAND' : 'E_INDEX_RANGE';
    const source = new SourceUnit(text);
    const tokens = variant === 'parser' ? lex(source) : [];
    const program = variant === 'lexer' || variant === 'parser' ? null : compile(source);
    return { batch: size, units: 1, unit: 'errors', details: { ...dimensions(text), expectedCode: code }, expected: 1, prepare() {
      const session = createSession(() => {});
      return () => {
        try { if (variant === 'lexer') lex(source); else if (variant === 'parser') new Parser(tokens).program(); else if (program) execute(program, session); }
        catch (error) { assert.ok(error instanceof LangError); assert.equal(error.code, code); return 1; }
        throw new Error('expected benchmark error did not occur');
      };
    } };
  }
  const { text, expected } = runtimeSource(variant, size);
  const program = compile(new SourceUnit(text));
  if (group === 'compile') return { batch: 10, units: text.length, unit: 'chars', details: dimensions(text), expected: program.statements.length, prepare: () => () => compile(new SourceUnit(text)).statements.length };
  return { batch: 1, units: variant === 'fibonacci' ? 1 : size, unit: variant === 'fibonacci' ? 'programs' : variant === 'factorial' ? 'factorials' : 'iterations', details: { ...dimensions(text), topLevelStatements: program.statements.length }, expected, prepare() {
    let output = '';
    const session = createSession(chunk => { output += chunk; });
    return () => { execute(group === 'pipeline' ? compile(new SourceUnit(text)) : program, session); return Number(output); };
  } };
}
