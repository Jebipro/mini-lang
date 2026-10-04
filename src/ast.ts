import type { Span } from './source-location.js';
export interface NodeBase { readonly span: Span; readonly height: number }
export interface Name { readonly text: string; readonly span: Span }
export interface Identifier extends NodeBase { readonly kind: 'Identifier'; readonly name: string }
export interface Index extends NodeBase { readonly kind: 'Index'; readonly base: Expr; readonly index: Expr; readonly anchor: Span }
export type Expr = Identifier | Index
  | (NodeBase & { readonly kind: 'Literal'; readonly value: number | string | boolean | null })
  | (NodeBase & { readonly kind: 'Group'; readonly expression: Expr })
  | (NodeBase & { readonly kind: 'Unary'; readonly operator: string; readonly operand: Expr; readonly anchor: Span })
  | (NodeBase & { readonly kind: 'Binary' | 'Logical'; readonly operator: string; readonly left: Expr; readonly right: Expr; readonly anchor: Span })
  | (NodeBase & { readonly kind: 'Assign'; readonly target: Identifier | Index; readonly value: Expr; readonly anchor: Span })
  | (NodeBase & { readonly kind: 'Array'; readonly elements: readonly Expr[] })
  | (NodeBase & { readonly kind: 'Call'; readonly callee: Expr; readonly args: readonly Expr[]; readonly anchor: Span });
export interface LetDecl extends NodeBase { readonly kind: 'Let'; readonly name: Name; readonly initializer: Expr }
export interface FunctionDecl extends NodeBase { readonly kind: 'Function'; readonly name: Name; readonly params: readonly Name[]; readonly body: Block }
export interface Block extends NodeBase { readonly kind: 'Block'; readonly statements: readonly Stmt[] }
export type Stmt = LetDecl | FunctionDecl | Block
  | (NodeBase & { readonly kind: 'Expression'; readonly expression: Expr })
  | (NodeBase & { readonly kind: 'If'; readonly condition: Expr; readonly thenBranch: Block; readonly elseBranch: Stmt | null })
  | (NodeBase & { readonly kind: 'While'; readonly condition: Expr; readonly body: Block })
  | (NodeBase & { readonly kind: 'Return'; readonly value: Expr | null; readonly anchor: Span });
export interface Program extends NodeBase { readonly kind: 'Program'; readonly statements: readonly Stmt[] }
