import type { Program } from './ast.js';
import { createBuiltins } from './builtins.js';
import { Environment } from './environment.js';
import { Interpreter } from './interpreter.js';
import { parse } from './parser.js';
import { SourceUnit } from './source-location.js';
import type { RuntimeValue } from './runtime-values.js';
export interface Session { readonly global: Environment; readonly interpreter: Interpreter }
export function createSession(output: (text: string) => void): Session {
  const builtins = new Environment(), source = new SourceUnit('', '<builtins>');
  for (const builtin of createBuiltins(output)) { builtins.reserve(builtin.name, source.span(0), false); builtins.initialize(builtin.name, builtin); }
  return { global: new Environment(builtins), interpreter: new Interpreter() };
}
export function compile(source: SourceUnit, mode: 'script' | 'repl' = 'script'): Program { return parse(source, mode); }
export function execute(program: Program, session: Session, echo?: (value: RuntimeValue) => void): void { session.interpreter.execute(program, session.global, echo); }
export function runSource(source: SourceUnit, session: Session): void { execute(compile(source), session); }
export function runScript(text: string, name: string, output: (text: string) => void): void { runSource(new SourceUnit(text, name), createSession(output)); }
