// Independent blind-review regressions (see CLAUDE_BLIND_REVIEW.md).
// BR-* tests reproduce bugs found in the review; BRC-* tests pin public contracts
// that the existing suite only checked loosely (substring/toThrow()).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SourceUnit } from '../src/source-location.js';
import { classify } from '../src/parser.js';
import { createSession, runSource, runScript } from '../src/runner.js';
import { LangError, formatError } from '../src/errors.js';
import { formatValue } from '../src/value-format.js';
import { Repl } from '../src/repl.js';
import type { ArrayValue } from '../src/runtime-values.js';

function failure(text: string): LangError {
  try { runScript(text, 'br.lang', () => {}); }
  catch (error) { if (error instanceof LangError) return error; throw error; }
  throw new Error(`expected a language error for ${JSON.stringify(text)}`);
}
function output(text: string): string {
  let result = '';
  runScript(text, 'br.lang', chunk => { result += chunk; });
  return result;
}

describe('BR-01 lexer reports a non-BMP illegal character as one whole character', () => {
  it('names the full code point instead of a lone surrogate', () => {
    const error = failure('😀;');
    expect(error).toMatchObject({ kind: 'SyntaxError', code: 'E_CHARACTER', message: "unexpected character '😀'", span: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 2 } } });
    expect(formatError(error)).toBe("SyntaxError at br.lang:1:1: unexpected character '😀'\n😀;\n^");
  });
  it('keeps UTF-16 line/column anchors on later lines', () => {
    expect(failure('let a = 1;\r\n  a 😀;')).toMatchObject({ code: 'E_CHARACTER', message: "unexpected character '😀'", span: { start: { offset: 16, line: 2, column: 5 }, end: { offset: 18 } } });
  });
  it('still reports a BMP character as before', () => {
    expect(failure('a@;')).toMatchObject({ code: 'E_CHARACTER', message: "unexpected character '@'", span: { start: { column: 2 }, end: { offset: 2 } } });
  });
});

describe('BRC-01 diagnostic kind/code/position/message contract (SPEC G2)', () => {
  it.each([
    ['let x=1;{x;let x=2;}', 'RuntimeError', 'E_TDZ', 1, 10, "variable 'x' accessed before initialization"],
    ['print=1;', 'RuntimeError', 'E_READONLY', 1, 1, "cannot assign to read-only binding 'print'"],
    ['missing=1;', 'RuntimeError', 'E_UNDEFINED', 1, 1, "undefined variable 'missing'"],
    ['fn f(a,b){}\nf(1);', 'RuntimeError', 'E_ARITY', 2, 2, "function 'f' expects 2 arguments but got 1"],
    ['let a=[1];\na[0.5];', 'TypeError', 'E_INDEX_TYPE', 2, 3, 'array index must be an integer number'],
    ['let a=[1];a[(true)];', 'TypeError', 'E_INDEX_TYPE', 1, 13, 'array index must be an integer number'],
    ['let a=[1,2,3];a[3];', 'RuntimeError', 'E_INDEX_RANGE', 1, 17, 'array index 3 out of bounds for length 3'],
    ['"abc"[0];', 'TypeError', 'E_INDEX_BASE', 1, 6, 'cannot index value of type string'],
    ['1();', 'TypeError', 'E_NOT_CALLABLE', 1, 2, 'value of type number is not callable'],
    ['fn f(){}\nf[0];', 'TypeError', 'E_INDEX_BASE', 2, 2, 'cannot index value of type function'],
    ['print(1 / 0);', 'RuntimeError', 'E_ZERO_DIVISION', 1, 9, 'division by zero'],
    ['print(1 % 0);', 'RuntimeError', 'E_ZERO_DIVISION', 1, 9, 'remainder by zero'],
    ['print(1' + '0'.repeat(308) + ' * 10);', 'RuntimeError', 'E_NONFINITE', 1, 317, 'numeric result is not finite'],
    ['print(-"a");', 'TypeError', 'E_OPERAND', 1, 7, "operator '-' cannot be applied to string"],
    ['print(1 < "a");', 'TypeError', 'E_OPERAND', 1, 9, "operator '<' cannot be applied to number and string"],
    ['len(true);', 'TypeError', 'E_LEN_TYPE', 1, 4, 'len expects array or string, got boolean'],
    ['print(1;', 'SyntaxError', 'E_EXPECTED', 1, 8, "expected ')' but found ';'"],
    ['print(1', 'SyntaxError', 'E_EXPECTED', 1, 8, "expected ')' but found EOF"],
    ['let = 1;', 'SyntaxError', 'E_EXPECTED', 1, 5, "expected 'identifier' but found '='"],
    ['1 + = 2;', 'SyntaxError', 'E_EXPECTED', 1, 5, "expected expression but found '='"],
    ['(a) = 1;', 'SyntaxError', 'E_ASSIGN_TARGET', 1, 5, 'invalid assignment target'],
    ['if (true) { return 1; }', 'SyntaxError', 'E_RETURN_CONTEXT', 1, 13, 'return is only allowed inside a function'],
    ['let x=1;\nlet x=2;', 'SyntaxError', 'E_DUPLICATE', 2, 5, "duplicate declaration 'x'"],
    ['fn f(a, a) {}', 'SyntaxError', 'E_DUPLICATE', 1, 9, "duplicate parameter 'a'"],
    ['fn f(a) { fn a() {} }', 'SyntaxError', 'E_DUPLICATE', 1, 14, "duplicate declaration 'a'"],
    ['let x = 12abc;', 'SyntaxError', 'E_NUMBER', 1, 11, 'invalid numeric suffix'],
    ['let x = ' + '9'.repeat(400) + ';', 'SyntaxError', 'E_NUMBER', 1, 9, 'numeric literal is not finite'],
    ['let s = "ab\ncd";', 'SyntaxError', 'E_STRING', 1, 12, 'newline in string literal'],
    ['let s = "abc', 'SyntaxError', 'E_STRING', 1, 9, 'unterminated string literal'],
    ['let s = "a\\qb";', 'SyntaxError', 'E_ESCAPE', 1, 11, 'invalid string escape'],
    ['x # y;', 'SyntaxError', 'E_CHARACTER', 1, 3, "unexpected character '#'"],
    ['a & b;', 'SyntaxError', 'E_CHARACTER', 1, 3, "unexpected character '&'"]
  ] as const)('%s', (text, kind, code, line, column, message) => {
    expect(failure(text)).toMatchObject({ kind, code, message, span: { start: { line, column } } });
  });
  it('anchors the 65th user call at its opening parenthesis', () => {
    expect(failure('fn f(n){if(n==0){return 0;}\n  return f(n-1);}f(64);')).toMatchObject({ kind: 'RuntimeError', code: 'E_CALL_DEPTH', message: 'maximum call depth (64) exceeded', span: { start: { line: 2, column: 11 } } });
  });
  it('reports REPL collisions as RuntimeError E_REDECLARE at the new name', () => {
    const session = createSession(() => {});
    runSource(new SourceUnit('let a=1;'), session);
    try { runSource(new SourceUnit('fn ok(){}\nfn a(){}', '<repl:2>'), session); expect.fail('expected collision'); }
    catch (error) { expect(error).toMatchObject({ kind: 'RuntimeError', code: 'E_REDECLARE', message: "name 'a' is already declared in this scope", span: { start: { line: 2, column: 4 } } }); }
  });
});

describe('BRC-02 exact resource-limit boundaries', () => {
  // Active evaluate/execute entries: top statement + call (2), 5 per recursive frame
  // (3 blocks + return + call), 4 in the base frame, plus one per Group paren.
  const def = 'fn f(n){if(n==0){return 0;}{{{return f(n-1);}}}}';
  it('allows exactly 256 active evaluation entries and rejects the 257th', () => {
    const wrapped = (parens: number, n: number) => def + '('.repeat(parens) + `f(${n})` + ')'.repeat(parens) + ';';
    expect(() => output(wrapped(5, 49))).not.toThrow();
    expect(failure(wrapped(6, 49))).toMatchObject({ code: 'E_EVAL_DEPTH', message: 'evaluation nesting limit (256) exceeded' });
    expect(() => output(wrapped(0, 50))).not.toThrow();
    expect(failure(wrapped(1, 50))).toMatchObject({ code: 'E_EVAL_DEPTH' });
  });
  it.each([
    ['unary', (n: number) => '!'.repeat(n) + 'true;'],
    ['assignment', (n: number) => 'a='.repeat(n) + '0;'],
    ['block', (n: number) => '{'.repeat(n) + '}'.repeat(n)],
    // Edges are counted parent -> child: n brackets around a leaf are n edges.
    ['array', (n: number) => '['.repeat(n) + '0' + ']'.repeat(n) + ';'],
    ['call argument', (n: number) => 'f('.repeat(n) + '0' + ')'.repeat(n) + ';'],
    ['index', (n: number) => 'a['.repeat(n) + '0' + ']'.repeat(n) + ';']
  ])('accepts 64 nested %s edges and rejects 65', (_name, make) => {
    expect(classify(new SourceUnit(make(64))).kind).toBe('complete');
    const rejected = classify(new SourceUnit(make(65)));
    expect(rejected).toMatchObject({ kind: 'invalid', error: { code: 'E_INPUT_LIMIT', message: 'syntax nesting limit (64) exceeded' } });
  });
  it('displays exactly 64 nested arrays and replaces the 65th with <max-depth>', () => {
    const nest = (count: number): ArrayValue => {
      let value: ArrayValue = { tag: 'array', elements: [] };
      for (let i = 1; i < count; i++) value = { tag: 'array', elements: [value] };
      return value;
    };
    expect(formatValue(nest(64))).toBe('['.repeat(64) + ']'.repeat(64));
    expect(formatValue(nest(65))).toBe('['.repeat(64) + '<max-depth>' + ']'.repeat(64));
  });
});

describe('BRC-03 REPL observable contracts', () => {
  function session(lines: readonly string[]): { out: string[]; errors: string[]; exit: number } {
    const out: string[] = [], errors: string[] = [];
    const repl = new Repl({ writeOutput: text => out.push(text), writeDiagnostic: text => errors.push(text), showPrompt: () => {} });
    for (const line of lines) repl.submitLine(line);
    return { out, errors, exit: repl.endInput() };
  }
  it('keeps the failed initializer in TDZ and reports each recovery attempt precisely', () => {
    const result = session(['let a=1;let b=1/0;', 'a', 'b', 'b=2;', 'let b=2;']);
    expect(result.out).toEqual(['1\n']);
    expect(result.errors.map(text => text.split('\n')[0])).toEqual([
      'RuntimeError at <repl:1>:1:16: division by zero',
      "RuntimeError at <repl:3>:1:1: variable 'b' accessed before initialization",
      "RuntimeError at <repl:4>:1:1: variable 'b' accessed before initialization",
      "RuntimeError at <repl:5>:1:5: name 'b' is already declared in this scope"
    ]);
  });
  it('echoes top-level strings raw and nested strings quoted', () => {
    expect(session(['"a b"', '["a b"]', 'len']).out).toEqual(['a b\n', '["a b"]\n', '<builtin len>\n']);
  });
  it('reports an incomplete EOF diagnostic with full format and exit 1', () => {
    const result = session(['let x =']);
    expect(result).toMatchObject({ exit: 1, out: [] });
    expect(result.errors).toEqual(['SyntaxError at <repl:1>:1:8: expected expression but found EOF\nlet x =\n       ^\n']);
  });
});

it('BRC-04 README language example prints the documented output', () => {
  const readme = readFileSync('README.md', 'utf8').replace(/\r\n/g, '\n');
  const program = /```mini-lang\n([\s\S]*?)```/.exec(readme)?.[1];
  const documented = /출력은 다음과 같습니다\.\n\n```text\n([\s\S]*?)```/.exec(readme)?.[1];
  expect(program).toBeDefined(); expect(documented).toBeDefined();
  expect(output(program ?? '')).toBe(documented);
});

// Found by the cross-model mutation check: no existing test pinned the Identifier
// half of SPEC C "대입 순서" (only the Index half), so evaluating RHS first survived.
describe('BRC-06 identifier assignment validates its target before evaluating RHS', () => {
  it.each([
    ['missing = print(1);', 'E_UNDEFINED'],
    ['print = print(1);', 'E_READONLY'],
    ['let x = 0; { x = print(1); let x = 2; }', 'E_TDZ']
  ])('%s', (text, code) => {
    let printed = '';
    try { runScript(text, 'br.lang', chunk => { printed += chunk; }); expect.fail('expected a language error'); }
    catch (error) { expect(error).toBeInstanceOf(LangError); expect(error).toMatchObject({ code }); }
    expect(printed).toBe('');
  });
});
