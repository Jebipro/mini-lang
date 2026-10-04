import { expect, it } from 'vitest';
import { lex } from '../src/lexer.js';
import { SourceUnit } from '../src/source-location.js';
const tokens = (text: string) => lex(new SourceUnit(text));
it('T-LEX-1 tokenizes literals, keywords, comments and longest operators', () => {
  expect(tokens('let a=12.5; // hi\na!=0 && a<=20;').map(t => t.kind)).toEqual(['let','identifier','=','number',';','identifier','!=','number','&&','identifier','<=','number',';','EOF']);
  expect(tokens('"a\\n"')[0]?.literal).toBe('a\n');
  expect(tokens('"a\\\\n"')[0]?.literal).toBe('a\\n');
});
it.each(['@', '&', '|', '.', '12abc', '"\\q"', '"abc', '"a\nb"', '9'.repeat(400)])('T-LEX-1 rejects %s', text => {
  expect(() => tokens(text)).toThrow();
});
it('T-LEX-2 records precise EOF and multiline offsets', () => {
  expect(tokens('')[0]?.span.start).toEqual({ offset: 0, line: 1, column: 1 });
  expect(tokens('x;\n').at(-1)?.span.start).toEqual({ offset: 3, line: 2, column: 1 });
  expect(tokens('\uFEFFx;\r\nprint(x);')[2]?.span.start).toEqual({ offset: 5, line: 2, column: 1 });
});
