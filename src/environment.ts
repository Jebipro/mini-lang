import { LangRuntimeError } from './errors.js';
import type { RuntimeValue } from './runtime-values.js';
import type { Span } from './source-location.js';
type CellState = { kind: 'uninitialized' } | { kind: 'initialized'; value: RuntimeValue };
export interface BindingCell { readonly name: string; readonly mutable: boolean; readonly declaration: Span; state: CellState }
export class Environment {
  private readonly bindings = new Map<string, BindingCell>();
  constructor(readonly parent: Environment | null = null) {}
  hasOwn(name: string): boolean { return this.bindings.has(name); }
  reserve(name: string, declaration: Span, mutable = true): void {
    if (this.hasOwn(name)) throw new LangRuntimeError('E_REDECLARE', `name '${name}' is already declared in this scope`, declaration);
    this.bindings.set(name, { name, mutable, declaration, state: { kind: 'uninitialized' } });
  }
  initialize(name: string, value: RuntimeValue): void {
    const cell = this.bindings.get(name);
    if (!cell || cell.state.kind !== 'uninitialized') throw new Error('invalid binding initialization');
    cell.state = { kind: 'initialized', value };
  }
  private lookup(name: string, span: Span): BindingCell {
    let scope: Environment | null = this;
    while (scope) {
      const cell = scope.bindings.get(name);
      if (cell) return cell;
      scope = scope.parent;
    }
    throw new LangRuntimeError('E_UNDEFINED', `undefined variable '${name}'`, span);
  }
  reference(name: string, span: Span, writing = false): BindingCell {
    const cell = this.lookup(name, span);
    if (cell.state.kind === 'uninitialized') throw new LangRuntimeError('E_TDZ', `variable '${name}' accessed before initialization`, span);
    if (writing && !cell.mutable) throw new LangRuntimeError('E_READONLY', `cannot assign to read-only binding '${name}'`, span);
    return cell;
  }
  get(name: string, span: Span): RuntimeValue {
    const cell = this.reference(name, span);
    if (cell.state.kind !== 'initialized') throw new Error('uninitialized reference');
    return cell.state.value;
  }
  assign(name: string, value: RuntimeValue, span: Span): void { this.reference(name, span, true).state = { kind: 'initialized', value }; }
}
