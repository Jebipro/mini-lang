import type { Block, Expr, Name, NodeBase, Program, Stmt } from './ast.js';
import { lex } from './lexer.js';
import { LangSyntaxError } from './errors.js';
import { combine, type SourceUnit, type Span } from './source-location.js';
import type { Token, TokenKind } from './token.js';
export class Parser {
  private cursor = 0;
  private nesting = 0;
  private functionDepth = 0;
  private readonly scopes: Set<string>[] = [];
  constructor(private readonly tokens: readonly Token[], private readonly mode: 'script' | 'repl' = 'script') {
    if (tokens.length === 0 || tokens.at(-1)?.kind !== 'EOF') throw new Error('parser requires EOF token');
  }
  private peek(): Token { const t = this.tokens[this.cursor]; if (!t) throw new Error('token cursor out of bounds'); return t; }
  private previous(): Token { const t = this.tokens[this.cursor - 1]; if (!t) throw new Error('no previous token'); return t; }
  private advance(): Token { const t = this.peek(); if (t.kind !== 'EOF') this.cursor++; return t; }
  private match(...kinds: TokenKind[]): boolean { if (!kinds.includes(this.peek().kind)) return false; this.advance(); return true; }
  private expect(kind: TokenKind): Token {
    if (this.peek().kind === kind) return this.advance();
    const t = this.peek();
    throw new LangSyntaxError('E_EXPECTED', `expected '${kind}' but found ${t.kind === 'EOF' ? 'EOF' : `'${t.lexeme}'`}`, t.span, t.kind === 'EOF', kind);
  }
  private nested<T>(operation: () => T): T {
    if (this.nesting >= 64) throw new LangSyntaxError('E_INPUT_LIMIT', 'syntax nesting limit (64) exceeded', this.peek().span);
    this.nesting++;
    try { return operation(); } finally { this.nesting--; }
  }
  private node<T extends { kind: string }>(data: T, start: Span, end: Span, children: readonly NodeBase[] = []): T & NodeBase {
    let height = 1;
    for (const child of children) height = Math.max(height, child.height + 1);
    if (height > 128) throw new LangSyntaxError('E_INPUT_LIMIT', 'AST depth limit (128) exceeded', start);
    return { ...data, span: combine(start, end), height };
  }
  expression(): Expr { return this.assignment(); }
  program(): Program {
    const start = this.peek().span;
    this.scopes.push(new Set());
    try {
      const statements: Stmt[] = [];
      while (this.peek().kind !== 'EOF') statements.push(this.declaration(true));
      return this.node({ kind: 'Program', statements }, start, this.peek().span, statements);
    } catch (error) {
      if (error instanceof RangeError) throw new LangSyntaxError('E_INPUT_LIMIT', 'host syntax limit exceeded', this.peek().span);
      throw error;
    } finally { this.scopes.pop(); }
  }
  private name(): Name { const token = this.expect('identifier'); return { text: token.lexeme, span: token.span }; }
  private registerName(name: Name, names = this.scopes.at(-1), role = 'declaration'): void {
    if (!names) throw new Error('declaration outside a parser scope');
    if (names.has(name.text)) throw new LangSyntaxError('E_DUPLICATE', `duplicate ${role} '${name.text}'`, name.span);
    names.add(name.text);
  }
  private declaration(topLevel = false): Stmt {
    if (this.match('let')) {
      const start = this.previous().span, name = this.name(); this.registerName(name); this.expect('=');
      const initializer = this.expression(); this.expect(';');
      return this.node({ kind: 'Let', name, initializer }, start, this.previous().span, [initializer]);
    }
    if (this.match('fn')) {
      const start = this.previous().span, name = this.name(); this.registerName(name); this.expect('(');
      const params: Name[] = [];
      const parameterNames = new Set<string>();
      if (this.peek().kind !== ')') {
        do { const param = this.name(); this.registerName(param, parameterNames, 'parameter'); params.push(param); } while (this.match(','));
      }
      this.expect(')');
      this.functionDepth++;
      let body: Block;
      try { body = this.block(params); } finally { this.functionDepth--; }
      return this.node({ kind: 'Function', name, params, body }, start, body.span, [body]);
    }
    return this.statement(topLevel);
  }
  private block(params: readonly Name[] = []): Block {
    const start = this.expect('{').span;
    return this.nested(() => {
      this.scopes.push(new Set(params.map(param => param.text)));
      try {
        const statements: Stmt[] = [];
        while (this.peek().kind !== '}' && this.peek().kind !== 'EOF') statements.push(this.declaration());
        this.expect('}');
        return this.node({ kind: 'Block', statements }, start, this.previous().span, statements);
      } finally { this.scopes.pop(); }
    });
  }
  private statement(topLevel: boolean): Stmt {
    if (this.peek().kind === '{') return this.block();
    if (this.match('if')) return this.ifStatement(this.previous().span);
    if (this.match('while')) {
      const start = this.previous().span; this.expect('(');
      const condition = this.nested(() => this.expression()); this.expect(')'); const body = this.block();
      return this.node({ kind: 'While', condition, body }, start, body.span, [condition, body]);
    }
    if (this.match('return')) {
      const anchor = this.previous().span;
      if (this.functionDepth === 0) throw new LangSyntaxError('E_RETURN_CONTEXT', 'return is only allowed inside a function', anchor);
      const value = this.peek().kind === ';' ? null : this.expression(); this.expect(';');
      return this.node({ kind: 'Return', value, anchor }, anchor, this.previous().span, value ? [value] : []);
    }
    const expression = this.expression();
    const end = topLevel && this.mode === 'repl' && this.peek().kind === 'EOF' ? expression.span : this.expect(';').span;
    return this.node({ kind: 'Expression', expression }, expression.span, end, [expression]);
  }
  private ifStatement(start: Span): Stmt {
    this.expect('('); const condition = this.nested(() => this.expression()); this.expect(')');
    const thenBranch = this.block(); let elseBranch: Stmt | null = null;
    if (this.match('else')) {
      elseBranch = this.match('if') ? this.nested(() => this.ifStatement(this.previous().span)) : this.block();
    }
    return this.node({ kind: 'If', condition, thenBranch, elseBranch }, start, elseBranch?.span ?? thenBranch.span, elseBranch ? [condition, thenBranch, elseBranch] : [condition, thenBranch]);
  }
  private assignment(): Expr {
    const target = this.or();
    if (!this.match('=')) return target;
    const anchor = this.previous().span;
    if (target.kind !== 'Identifier' && target.kind !== 'Index') throw new LangSyntaxError('E_ASSIGN_TARGET', 'invalid assignment target', anchor);
    const value = this.nested(() => this.assignment());
    return this.node({ kind: 'Assign', target, value, anchor }, target.span, value.span, [target, value]);
  }
  private binary(next: () => Expr, operators: readonly TokenKind[], kind: 'Binary' | 'Logical' = 'Binary'): Expr {
    let left = next();
    while (operators.includes(this.peek().kind)) {
      const operator = this.advance(), right = next();
      left = this.node({ kind, left, right, operator: operator.lexeme, anchor: operator.span }, left.span, right.span, [left, right]);
    }
    return left;
  }
  private or(): Expr { return this.binary(() => this.and(), ['||'], 'Logical'); }
  private and(): Expr { return this.binary(() => this.equality(), ['&&'], 'Logical'); }
  private equality(): Expr { return this.binary(() => this.comparison(), ['==', '!=']); }
  private comparison(): Expr { return this.binary(() => this.term(), ['<','<=','>','>=']); }
  private term(): Expr { return this.binary(() => this.factor(), ['+','-']); }
  private factor(): Expr { return this.binary(() => this.unary(), ['*','/','%']); }
  private unary(): Expr {
    if (!this.match('!','-','+')) return this.postfix();
    const token = this.previous(), operand = this.nested(() => this.unary());
    return this.node({ kind: 'Unary', operator: token.lexeme, operand, anchor: token.span }, token.span, operand.span, [operand]);
  }
  private list(end: TokenKind): Expr[] {
    const elements: Expr[] = [];
    if (this.peek().kind !== end) {
      do { elements.push(this.nested(() => this.expression())); } while (this.match(','));
    }
    this.expect(end); return elements;
  }
  private postfix(): Expr {
    let expression = this.primary();
    while (true) {
      if (this.match('(')) {
        const anchor = this.previous().span, args = this.list(')');
        expression = this.node({ kind: 'Call', callee: expression, args, anchor }, expression.span, this.previous().span, [expression, ...args]);
      } else if (this.match('[')) {
        const anchor = this.previous().span, index = this.nested(() => this.expression()); this.expect(']');
        expression = this.node({ kind: 'Index', base: expression, index, anchor }, expression.span, this.previous().span, [expression, index]);
      } else return expression;
    }
  }
  private primary(): Expr {
    const token = this.peek();
    if (this.match('number','string')) {
      if (token.literal === undefined) throw new Error('literal token missing payload');
      return this.node({ kind: 'Literal', value: token.literal }, token.span, token.span);
    }
    if (this.match('true','false','null')) return this.node({ kind: 'Literal', value: token.kind === 'null' ? null : token.kind === 'true' }, token.span, token.span);
    if (this.match('identifier')) return this.node({ kind: 'Identifier', name: token.lexeme }, token.span, token.span);
    if (this.match('(')) {
      const expression = this.nested(() => this.expression()); this.expect(')');
      return this.node({ kind: 'Group', expression }, token.span, this.previous().span, [expression]);
    }
    if (this.match('[')) {
      const elements = this.list(']');
      return this.node({ kind: 'Array', elements }, token.span, this.previous().span, elements);
    }
    throw new LangSyntaxError('E_EXPECTED', `expected expression but found ${token.kind === 'EOF' ? 'EOF' : `'${token.lexeme}'`}`, token.span, token.kind === 'EOF', 'expression');
  }
}
export function parse(source: SourceUnit, mode: 'script' | 'repl' = 'script'): Program { return new Parser(lex(source), mode).program(); }
export type ParseResult = { kind: 'complete'; program: Program } | { kind: 'incomplete' | 'invalid'; error: LangSyntaxError };
export function classify(source: SourceUnit): ParseResult {
  try { return { kind: 'complete', program: parse(source, 'repl') }; }
  catch (error) {
    if (error instanceof LangSyntaxError) return { kind: error.incompleteCandidate ? 'incomplete' : 'invalid', error };
    throw error;
  }
}
