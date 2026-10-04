import { expect, it } from 'vitest';
import { SourceUnit } from '../src/source-location.js';
import { LangTypeError, formatError } from '../src/errors.js';
it('T-LEX-2 / T-LOC-4 preserves BOM, CRLF, CR, EOF and UTF-16 positions', () => {
  const source = new SourceUnit('\uFEFFx;\r\n😀\r', 'case');
  expect(source.position(1)).toEqual({ offset: 1, line: 1, column: 1 });
  expect(source.position(5)).toEqual({ offset: 5, line: 2, column: 1 });
  expect(source.position(8)).toEqual({ offset: 8, line: 3, column: 1 });
  expect(source.lineText(1)).toBe('x;');
  expect(source.lineText(2)).toBe('😀');
});
it('T-LOC-4 formats exact messages and operator caret', () => {
  const source = new SourceUnit('let x = 1 + "a";', 'demo.lang');
  const error = new LangTypeError('E_OPERAND', "operator '+' cannot be applied to number and string", source.span(10, 11));
  expect(formatError(error)).toBe('TypeError at demo.lang:1:11: operator \'+\' cannot be applied to number and string\nlet x = 1 + "a";\n          ^');
});
it('preserves a non-initial BOM in diagnostic source lines',()=>{
  const source=new SourceUnit('x;\n\uFEFFbad');
  expect(source.lineText(2)).toBe('\uFEFFbad');
  expect(source.position(4)).toMatchObject({line:2,column:2});
});
