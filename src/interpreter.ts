import type { Expr, Index, Program, Stmt } from './ast.js';
import { Environment } from './environment.js';
import { LangRuntimeError, LangTypeError, unreachable } from './errors.js';
import { binary, NULL, primitive, truthy, typeName, type ArrayValue, type RuntimeValue } from './runtime-values.js';
import type { Span } from './source-location.js';
type Completion = { readonly kind: 'normal' } | { readonly kind: 'return'; readonly value: RuntimeValue };
const NORMAL: Completion = { kind: 'normal' };
export class Interpreter {
  private evaluationDepth = 0;
  private callDepth = 0;
  execute(program: Program, environment: Environment, echo?: (value: RuntimeValue) => void): void {
    try {
      this.prepare(program.statements, environment);
      const result = this.list(program.statements, environment, echo);
      if (result.kind !== 'normal') throw new Error('top-level return escaped parser validation');
    } catch (error) { this.rethrowRuntime(error, program.span); }
  }
  private rethrowRuntime(error: unknown, span: Span): never {
    if (error instanceof RangeError) throw new LangRuntimeError('E_HOST_LIMIT', 'host runtime limit exceeded', span, { cause: error });
    throw error;
  }
  private prepare(statements: readonly Stmt[], env: Environment): void {
    for (const stmt of statements) {
      if ((stmt.kind === 'Let' || stmt.kind === 'Function') && env.hasOwn(stmt.name.text)) throw new LangRuntimeError('E_REDECLARE', `name '${stmt.name.text}' is already declared in this scope`, stmt.name.span);
    }
    for (const stmt of statements) if (stmt.kind === 'Let' || stmt.kind === 'Function') env.reserve(stmt.name.text, stmt.name.span);
    for (const stmt of statements) if (stmt.kind === 'Function') {
      env.initialize(stmt.name.text, { tag: 'user-function', name: stmt.name.text, declaration: stmt, closure: env, arity: { min: stmt.params.length, max: stmt.params.length } });
    }
  }
  private guard<T>(span: Span, operation: () => T): T {
    if (this.evaluationDepth >= 256) throw new LangRuntimeError('E_EVAL_DEPTH', 'evaluation nesting limit (256) exceeded', span);
    this.evaluationDepth++;
    try { return operation(); }
    catch (error) { this.rethrowRuntime(error, span); }
    finally { this.evaluationDepth--; }
  }
  private list(statements: readonly Stmt[], env: Environment, echo?: (value: RuntimeValue) => void): Completion {
    for (const statement of statements) {
      const result = this.statement(statement, env, echo);
      if (result.kind === 'return') return result;
    }
    return NORMAL;
  }
  private statement(stmt: Stmt, env: Environment, echo?: (value: RuntimeValue) => void): Completion {
    return this.guard(stmt.span, () => {
      switch (stmt.kind) {
        case 'Expression': { const value = this.evaluate(stmt.expression, env); echo?.(value); return NORMAL; }
        case 'Let': env.initialize(stmt.name.text, this.evaluate(stmt.initializer, env)); return NORMAL;
        case 'Function': return NORMAL;
        case 'Return': return { kind: 'return', value: stmt.value ? this.evaluate(stmt.value, env) : NULL };
        case 'Block': { const child = new Environment(env); this.prepare(stmt.statements, child); return this.list(stmt.statements, child); }
        case 'If': return truthy(this.evaluate(stmt.condition, env)) ? this.statement(stmt.thenBranch, env) : stmt.elseBranch ? this.statement(stmt.elseBranch, env) : NORMAL;
        case 'While': {
          while (truthy(this.evaluate(stmt.condition, env))) {
            const result = this.statement(stmt.body, env); if (result.kind === 'return') return result;
          }
          return NORMAL;
        }
        default: return unreachable(stmt);
      }
    });
  }
  evaluate(expr: Expr, env: Environment): RuntimeValue {
    return this.guard('anchor' in expr ? expr.anchor : expr.span, () => {
      switch (expr.kind) {
        case 'Literal': return primitive(expr.value);
        case 'Identifier': return env.get(expr.name, expr.span);
        case 'Group': return this.evaluate(expr.expression, env);
        case 'Unary': {
          const value = this.evaluate(expr.operand, env);
          if (expr.operator === '!') return primitive(!truthy(value));
          if (value.tag !== 'number') throw new LangTypeError('E_OPERAND', `operator '${expr.operator}' cannot be applied to ${typeName(value)}`, expr.anchor);
          return primitive(expr.operator === '-' ? -value.value : value.value);
        }
        case 'Binary': return binary(expr.operator, this.evaluate(expr.left, env), this.evaluate(expr.right, env), expr.anchor);
        case 'Logical': {
          const left = this.evaluate(expr.left, env);
          return (expr.operator === '&&' ? truthy(left) : !truthy(left)) ? this.evaluate(expr.right, env) : left;
        }
        case 'Assign': {
          if (expr.target.kind === 'Identifier') {
            const cell = env.reference(expr.target.name, expr.target.span, true);
            const value = this.evaluate(expr.value, env); cell.state = { kind: 'initialized', value }; return value;
          }
          const {array,index} = this.indexReference(expr.target,env);
          const value = this.evaluate(expr.value,env); array.elements[index] = value; return value;
        }
        case 'Array': return { tag: 'array', elements: expr.elements.map(element => this.evaluate(element,env)) };
        case 'Index': {
          const {array,index} = this.indexReference(expr,env), value = array.elements[index];
          if (value === undefined) throw new Error('array invariant violated');
          return value;
        }
        case 'Call': {
          const callee = this.evaluate(expr.callee,env);
          if (callee.tag !== 'user-function' && callee.tag !== 'builtin') throw new LangTypeError('E_NOT_CALLABLE', `value of type ${typeName(callee)} is not callable`, expr.anchor);
          if (expr.args.length < callee.arity.min || (callee.arity.max !== null && expr.args.length > callee.arity.max)) {
            const count = callee.arity.max === callee.arity.min ? String(callee.arity.min) : `at least ${callee.arity.min}`;
            throw new LangRuntimeError('E_ARITY', `function '${callee.name}' expects ${count} arguments but got ${expr.args.length}`, expr.anchor);
          }
          const args = expr.args.map(arg => this.evaluate(arg,env));
          if (callee.tag === 'builtin') return callee.invoke(args,expr.anchor);
          if (this.callDepth >= 64) throw new LangRuntimeError('E_CALL_DEPTH', 'maximum call depth (64) exceeded', expr.anchor);
          this.callDepth++;
          try {
            const frame = new Environment(callee.closure);
            callee.declaration.params.forEach((param,index) => {
              const value = args[index]; if (value === undefined) throw new Error('arity invariant violated');
              frame.reserve(param.text,param.span); frame.initialize(param.text,value);
            });
            this.prepare(callee.declaration.body.statements,frame);
            const result = this.list(callee.declaration.body.statements,frame);
            return result.kind === 'return' ? result.value : NULL;
          } finally { this.callDepth--; }
        }
        default: return unreachable(expr);
      }
    });
  }
  private indexReference(expr: Index, env: Environment): { array: ArrayValue; index: number } {
    const array = this.evaluate(expr.base,env);
    if (array.tag !== 'array') throw new LangTypeError('E_INDEX_BASE', `cannot index value of type ${typeName(array)}`, expr.anchor);
    const index = this.evaluate(expr.index,env);
    if (index.tag !== 'number' || !Number.isInteger(index.value)) throw new LangTypeError('E_INDEX_TYPE', 'array index must be an integer number', expr.index.span);
    if (index.value < 0 || index.value >= array.elements.length) throw new LangRuntimeError('E_INDEX_RANGE', `array index ${index.value} out of bounds for length ${array.elements.length}`, expr.index.span);
    return { array, index: index.value };
  }
}
