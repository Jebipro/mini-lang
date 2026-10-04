import assert from 'node:assert/strict';
import { SourceUnit, type Span } from '../../src/source-location.js';
import { lex } from '../../src/lexer.js';
import { Parser, classify } from '../../src/parser.js';
import { LangSyntaxError, LangRuntimeError, LangTypeError } from '../../src/errors.js';
import { createSession, execute, runSource } from '../../src/runner.js';
import type { FuzzCase } from './generator.js';

export function checkCase(input: FuzzCase): { parsed: boolean; executed: boolean; outcome: string } {
  const source = new SourceUnit(input.text, `fuzz:${input.seed}:${input.index}`);
  const positions: { offset: number; line: number; column: number }[] = [];
  let line = 1, start = 0;
  for (let offset = 0; offset <= input.text.length; offset++) {
    if (offset > 0) {
      const previous = input.text[offset - 1];
      if (previous === '\n' || (previous === '\r' && input.text[offset] !== '\n')) { line++; start = offset; }
    }
    const bom = line === 1 && input.text[0] === '\uFEFF' && offset > 0 ? 1 : 0;
    positions.push({ offset, line, column: offset - start + 1 - bom });
  }
  function span(value: Span): void {
    assert.equal(value.source, source);
    assert.ok(value.start.offset >= 0 && value.end.offset <= input.text.length && value.start.offset <= value.end.offset);
    assert.deepEqual(value.start, positions[value.start.offset]);
    assert.deepEqual(value.end, positions[value.end.offset]);
  }
  function ast(value: unknown): number {
    if (value === null || typeof value !== 'object') return 0;
    if (Array.isArray(value)) return Math.max(0, ...value.map(ast));
    let childHeight = 0;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'span' || key === 'anchor') {
        assert.ok(child && typeof child === 'object' && 'source' in child);
        // AST spans are typed by the parser; validate their structure independently below.
        span(child);
      } else if (key !== 'height') childHeight = Math.max(childHeight, ast(child));
    }
    if ('height' in value) {
      assert.equal(value.height, childHeight + 1);
      assert.ok(typeof value.height === 'number' && value.height <= 128);
      return value.height;
    }
    return childHeight;
  }
  let outcome = 'success', parsed = false, executed = false;
  try {
    const tokens = lex(source);
    assert.equal(tokens.filter(token => token.kind === 'EOF').length, 1);
    assert.equal(tokens.at(-1)?.kind, 'EOF');
    let end = 0;
    for (const token of tokens) {
      span(token.span);
      assert.ok(token.span.start.offset >= end);
      assert.equal(token.lexeme, input.text.slice(token.span.start.offset, token.span.end.offset));
      if (token.kind !== 'EOF') assert.ok(token.span.end.offset > token.span.start.offset);
      if (token.kind === 'number') assert.ok(typeof token.literal === 'number' && Number.isFinite(token.literal));
      end = token.span.end.offset;
    }
    assert.equal(end, input.text.length);
    assert.equal(tokens.at(-1)?.span.start.offset, end);
    const guarded = new Proxy(tokens, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) assert.ok(Number(key) < target.length, 'parser read beyond EOF');
        return Reflect.get(target, key, receiver);
      }
    });
    const parser = new Parser(guarded);
    const program = parser.program();
    parsed = true;
    ast(program);
    assert.equal(parser.program().statements.length, 0, 'EOF must remain stable');
    // Arbitrary source may legitimately contain a nonterminating while. Only the
    // grammar lane's private loop counters have a construction-time termination proof.
    const containsWhile = JSON.stringify(program, (key, value: unknown) => key === 'span' || key === 'anchor' ? undefined : value).includes('"While"');
    if (input.grammar || !containsWhile) {
      const session = createSession(() => {});
      executed = true;
      try { execute(program, session); }
      catch (error) {
        assert.ok(error instanceof LangRuntimeError || error instanceof LangTypeError, `host exception: ${String(error)}`);
        assert.ok(error.code !== 'E_HOST_LIMIT', 'host limit reached before language guard');
        span(error.span);
        outcome = error.code;
      }
      assert.equal(Reflect.get(session.interpreter, 'callDepth'), 0, 'call counter leaked');
      assert.equal(Reflect.get(session.interpreter, 'evaluationDepth'), 0, 'evaluation counter leaked');
      // Same interpreter, fresh environment: avoid treating retained TDZs as a reset bug.
      const probe = createSession(() => {});
      runSource(new SourceUnit('fn probe(n){if(n==0){return 0;}return probe(n-1);}probe(63);'), { ...probe, interpreter: session.interpreter });
    }
  } catch (error) {
    if (!(error instanceof LangSyntaxError)) throw error;
    assert.ok(!input.grammar, `grammar generator produced invalid source: ${error.message}`);
    assert.notEqual(error.message, 'host syntax limit exceeded', 'host stack limit preceded syntax guard');
    span(error.span);
    outcome = error.code;
  }
  const result = classify(source);
  if (parsed) assert.equal(result.kind, 'complete', 'script success must also parse in REPL mode');
  if (result.kind !== 'complete') span(result.error.span);
  else ast(result.program);
  if (input.expected) assert.equal(outcome, input.expected, `${input.category} boundary`);
  return { parsed, executed, outcome };
}
