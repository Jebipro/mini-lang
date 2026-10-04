import type { Span } from './source-location.js';
export const keywords = ['let','fn','if','else','while','return','true','false','null'] as const;
export const symbols = ['(',')','{','}','[',']',',',';','+','-','*','/','%','!','=','<','>','!=','==','<=','>=','&&','||'] as const;
export type TokenKind = typeof keywords[number] | typeof symbols[number] | 'identifier' | 'number' | 'string' | 'EOF';
export interface Token { readonly kind: TokenKind; readonly lexeme: string; readonly span: Span; readonly literal?: number | string }
