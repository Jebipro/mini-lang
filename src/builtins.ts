import { LangTypeError } from './errors.js';
import { NULL, primitive, typeName, type Builtin } from './runtime-values.js';
import { formatValue } from './value-format.js';
export function createBuiltins(writeOutput: (text: string) => void): readonly Builtin[] {
  return [
    { tag: 'builtin', name: 'print', arity: { min: 0, max: null }, invoke(args) { writeOutput(args.map(formatValue).join(' ') + '\n'); return NULL; } },
    { tag: 'builtin', name: 'len', arity: { min: 1, max: 1 }, invoke(args, span) {
      const value = args[0];
      if (!value) throw new Error('len arity invariant violated');
      if (value.tag === 'array') return primitive(value.elements.length);
      if (value.tag === 'string') return primitive(value.value.length);
      throw new LangTypeError('E_LEN_TYPE', `len expects array or string, got ${typeName(value)}`, span);
    } }
  ];
}
