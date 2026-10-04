import { expect, it } from 'vitest';
import { Environment } from '../src/environment.js';
import { primitive } from '../src/runtime-values.js';
import { SourceUnit } from '../src/source-location.js';
const span = new SourceUnit('x').span(0, 1);
it('T-SCOPE-2 / T-CONTRACT-1 uses nearest lexical binding and own-only shadowing', () => {
  const outer = new Environment(); outer.reserve('x', span); outer.initialize('x', primitive(1));
  const inner = new Environment(outer); inner.assign('x', primitive(2), span);
  expect(outer.get('x', span)).toEqual(primitive(2));
  inner.reserve('x', span); inner.initialize('x', primitive(3)); inner.assign('x', primitive(4), span);
  expect(inner.get('x', span)).toEqual(primitive(4)); expect(outer.get('x', span)).toEqual(primitive(2));
});
it('T-SCOPE-3 / T-SCOPE-4 differentiates TDZ, null, missing and redeclaration', () => {
  const env = new Environment();
  expect(() => env.get('x', span)).toThrow("undefined variable 'x'");
  env.reserve('x', span);
  expect(() => env.get('x', span)).toThrow('before initialization');
  expect(() => env.assign('x', primitive(2), span)).toThrow('before initialization');
  expect(() => env.reserve('x', span)).toThrow('already declared');
  env.initialize('x', primitive(null)); expect(env.get('x', span)).toEqual(primitive(null));
});
it('T-BI-2 protects readonly parent bindings while allowing own shadowing', () => {
  const parent = new Environment(); parent.reserve('x', span, false); parent.initialize('x', primitive(1));
  const child = new Environment(parent);
  expect(() => child.assign('x', primitive(2), span)).toThrow('read-only');
  child.reserve('x', span); child.initialize('x', primitive(3)); expect(child.get('x', span)).toEqual(primitive(3));
});
