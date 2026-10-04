import type { Span } from './source-location.js';
export class LangError extends Error {
  constructor(readonly kind: 'SyntaxError' | 'RuntimeError' | 'TypeError', readonly code: string, message: string, readonly span: Span, options?: ErrorOptions) {
    super(message, options); this.name = kind;
  }
}
export class LangSyntaxError extends LangError {
  constructor(code: string, message: string, span: Span, readonly incompleteCandidate = false, readonly expected: string | null = null) {
    super('SyntaxError', code, message, span);
  }
}
export class LangRuntimeError extends LangError {
  constructor(code: string, message: string, span: Span, options?: ErrorOptions) { super('RuntimeError', code, message, span, options); }
}
export class LangTypeError extends LangError {
  constructor(code: string, message: string, span: Span) { super('TypeError', code, message, span); }
}
export function formatError(error: LangError): string {
  const { source, start } = error.span;
  return `${error.kind} at ${source.displayName}:${start.line}:${start.column}: ${error.message}\n${source.lineText(start.line).replace(/\t/g, ' ')}\n${' '.repeat(start.column - 1)}^`;
}
export function unreachable(value: never): never { throw new Error(`unhandled variant: ${String(value)}`); }
