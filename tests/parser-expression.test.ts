import { expect, it } from 'vitest';
import { Parser } from '../src/parser.js';
import { lex } from '../src/lexer.js';
import { SourceUnit } from '../src/source-location.js';
const parse = (text: string) => new Parser(lex(new SourceUnit(text))).expression();
it('T-PREC-1 / T-PREC-2 parses precedence and left associativity', () => {
  expect(parse('1+2*3')).toMatchObject({ kind: 'Binary', operator: '+', right: { kind: 'Binary', operator: '*' } });
  expect(parse('10-3-2')).toMatchObject({ kind: 'Binary', left: { kind: 'Binary', operator: '-' } });
  expect(parse('true || false && false')).toMatchObject({ kind: 'Logical', operator: '||', right: { operator: '&&' } });
});
it('T-ASG-1 assignment is right associative', () => {
  expect(parse('a=b=3')).toMatchObject({ kind: 'Assign', target: { name: 'a' }, value: { kind: 'Assign', target: { name: 'b' } } });
});
it.each(['1=2','(a)=1','f()=2','a+b=3','1+2='])('T-ASG-2 rejects target %s', text => {
  expect(() => parse(text)).toThrow('invalid assignment target');
});
it.each(['f(,)','f(1,)','f(1 2)','[1,,2]','[1,]','a[]'])('T-PARSE-2 rejects %s', text => expect(() => parse(text)).toThrow());
it('T-CALL-3 / T-LOC-2 parses chained calls and preserves grouping and anchors', () => {
  expect(parse('f(1)[0](2)')).toMatchObject({ kind: 'Call', callee: { kind: 'Index', base: { kind: 'Call' } } });
  const expr = parse('(f(1))[0]');
  expect(expr).toMatchObject({ kind: 'Index', anchor: { start: { column: 7 } }, base: { kind: 'Group', span: { start: { offset: 0 }, end: { offset: 6 } } } });
});
it('T-LOC-1 retains operator and full expression spans', () => {
  expect(parse('1 + 2 * 3')).toMatchObject({ span: { start: { offset: 0 }, end: { offset: 9 } }, anchor: { start: { column: 3 } }, right: { anchor: { start: { column: 7 } } } });
});
