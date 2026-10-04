import { expect, it } from 'vitest';
import { primitive, truthy, equal, binary, type ArrayValue } from '../src/runtime-values.js';
import { formatValue } from '../src/value-format.js';
import { SourceUnit } from '../src/source-location.js';
const span = new SourceUnit('+').span(0, 1);
it('T-VAL-1 false and null alone are falsy', () => {
  for (const value of [0, '', true, 1]) expect(truthy(primitive(value))).toBe(true);
  for (const value of [false, null]) expect(truthy(primitive(value))).toBe(false);
});
it('T-VAL-2 compares primitives by tag/value and arrays by identity', () => {
  const a: ArrayValue = { tag: 'array', elements: [] };
  expect(equal(a, a)).toBe(true); expect(equal(a, { tag: 'array', elements: [] })).toBe(false);
  expect(equal(primitive(0), primitive(-0))).toBe(true); expect(equal(primitive(1), primitive('1'))).toBe(false);
});
it('T-NUM-1 / T-NUM-2 validates arithmetic and finite results', () => {
  expect(binary('%', primitive(-5), primitive(2), span)).toEqual(primitive(-1));
  expect(binary('+', primitive('a'), primitive('b'), span)).toEqual(primitive('ab'));
  expect(() => binary('/', primitive(1), primitive(0), span)).toThrow('division by zero');
  expect(() => binary('*', primitive(1e308), primitive(1e308), span)).toThrow('not finite');
  expect(() => binary('+', primitive(1), primitive('a'), span)).toThrow("operator '+' cannot be applied to number and string");
});
it('T-FMT-1 handles cycles, aliases, escaping and finite display depth', () => {
  const a: ArrayValue = { tag: 'array', elements: [] }; a.elements.push(a);
  expect(formatValue(a)).toBe('[<cycle>]');
  const b: ArrayValue = { tag: 'array', elements: [primitive('x\n')] };
  expect(formatValue({ tag: 'array', elements: [b,b] })).toBe('[["x\\n"], ["x\\n"]]');
  let deep: ArrayValue = { tag: 'array', elements: [] };
  for (let i = 0; i < 64; i++) deep = { tag: 'array', elements: [deep] };
  expect(formatValue(deep)).toContain('<max-depth>');
  expect(formatValue(primitive(-0))).toBe('0');
});
