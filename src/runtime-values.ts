import { LangRuntimeError, LangTypeError, unreachable } from './errors.js';
import type { Span } from './source-location.js';
import type { FunctionDecl } from './ast.js';
import type { Environment } from './environment.js';
export interface UserFunction { readonly tag: 'user-function'; readonly name: string; readonly declaration: FunctionDecl; readonly closure: Environment; readonly arity: Arity }
export interface Arity { readonly min: number; readonly max: number | null }
export interface Builtin { readonly tag: 'builtin'; readonly name: string; readonly arity: Arity; readonly invoke: (args: readonly RuntimeValue[], span: Span) => RuntimeValue }
export interface ArrayValue { readonly tag: 'array'; readonly elements: RuntimeValue[] }
export type RuntimeValue = { readonly tag: 'number'; readonly value: number }
  | { readonly tag: 'string'; readonly value: string }
  | { readonly tag: 'boolean'; readonly value: boolean }
  | { readonly tag: 'null' } | ArrayValue | UserFunction | Builtin;
export const NULL: RuntimeValue = { tag: 'null' };
export function primitive(value: number | string | boolean | null): RuntimeValue {
  if (value === null) return NULL;
  switch (typeof value) {
    case 'number': if (!Number.isFinite(value)) throw new Error('non-finite host value'); return { tag: 'number', value };
    case 'string': return { tag: 'string', value };
    case 'boolean': return { tag: 'boolean', value };
    default: return unreachable(value);
  }
}
export function truthy(value: RuntimeValue): boolean { return value.tag !== 'null' && !(value.tag === 'boolean' && !value.value); }
export function typeName(value: RuntimeValue): string { return value.tag === 'user-function' || value.tag === 'builtin' ? 'function' : value.tag; }
export function equal(left: RuntimeValue, right: RuntimeValue): boolean {
  switch (left.tag) {
    case 'null': return right.tag === 'null';
    case 'number': return right.tag === 'number' && left.value === right.value;
    case 'string': return right.tag === 'string' && left.value === right.value;
    case 'boolean': return right.tag === 'boolean' && left.value === right.value;
    case 'array': case 'user-function': case 'builtin': return left === right;
    default: return unreachable(left);
  }
}
export function binary(operator: string, left: RuntimeValue, right: RuntimeValue, span: Span): RuntimeValue {
  if (operator === '==') return primitive(equal(left, right));
  if (operator === '!=') return primitive(!equal(left, right));
  if (operator === '+' && left.tag === 'string' && right.tag === 'string') return primitive(left.value + right.value);
  if (left.tag !== 'number' || right.tag !== 'number') throw new LangTypeError('E_OPERAND', `operator '${operator}' cannot be applied to ${typeName(left)} and ${typeName(right)}`, span);
  const a = left.value, b = right.value;
  if ((operator === '/' || operator === '%') && b === 0) throw new LangRuntimeError('E_ZERO_DIVISION', operator === '/' ? 'division by zero' : 'remainder by zero', span);
  let value: number | boolean;
  switch (operator) {
    case '+': value = a + b; break; case '-': value = a - b; break;
    case '*': value = a * b; break; case '/': value = a / b; break; case '%': value = a % b; break;
    case '<': value = a < b; break; case '<=': value = a <= b; break; case '>': value = a > b; break; case '>=': value = a >= b; break;
    default: throw new Error(`invalid binary operator ${operator}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new LangRuntimeError('E_NONFINITE', 'numeric result is not finite', span);
  return primitive(value);
}
