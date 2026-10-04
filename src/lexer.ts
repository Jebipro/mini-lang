import { LangSyntaxError } from './errors.js';
import type { SourceUnit } from './source-location.js';
import { keywords, symbols, type Token, type TokenKind } from './token.js';
const keywordMap = new Map<string, TokenKind>(keywords.map(kind => [kind, kind]));
const symbolMap = new Map<string, TokenKind>(symbols.map(kind => [kind, kind]));
const digit = (c: string) => /^[0-9]$/.test(c);
const letter = (c: string) => /^[A-Za-z_]$/.test(c);
export function lex(source: SourceUnit): Token[] {
  const text = source.text, tokens: Token[] = [];
  let current = text[0] === '\uFEFF' ? 1 : 0;
  const emit = (kind: TokenKind, start: number, literal?: number | string) => {
    const token = { kind, lexeme: text.slice(start, current), span: source.span(start, current) };
    tokens.push(literal === undefined ? token : { ...token, literal });
  };
  try {
    while (current < text.length) {
      const start = current, c = text[current] ?? '';
      if (' \t\r\n'.includes(c)) { current++; continue; }
      if (c === '/' && text[current + 1] === '/') {
        while (current < text.length && !'\r\n'.includes(text[current] ?? '')) current++;
        continue;
      }
      if (letter(c)) {
        while (letter(text[current] ?? '') || digit(text[current] ?? '')) current++;
        emit(keywordMap.get(text.slice(start, current)) ?? 'identifier', start); continue;
      }
      if (digit(c)) {
        while (digit(text[current] ?? '')) current++;
        if (text[current] === '.' && digit(text[current + 1] ?? '')) {
          current++; while (digit(text[current] ?? '')) current++;
        }
        if (letter(text[current] ?? '')) throw new LangSyntaxError('E_NUMBER', 'invalid numeric suffix', source.span(current, current + 1));
        const value = Number(text.slice(start, current));
        if (!Number.isFinite(value)) throw new LangSyntaxError('E_NUMBER', 'numeric literal is not finite', source.span(start, current));
        emit('number', start, value); continue;
      }
      if (c === '"') {
        current++; let value = '';
        while (current < text.length && text[current] !== '"') {
          const ch = text[current] ?? '';
          if (ch === '\r' || ch === '\n') throw new LangSyntaxError('E_STRING', 'newline in string literal', source.span(current, current + 1));
          if (ch === '\\') {
            const escape = text[current + 1];
            const decoded = escape === 'n' ? '\n' : escape === 'r' ? '\r' : escape === 't' ? '\t' : escape === '"' ? '"' : escape === '\\' ? '\\' : null;
            if (decoded === null) throw new LangSyntaxError('E_ESCAPE', 'invalid string escape', source.span(current, Math.min(current + 2, text.length)));
            value += decoded; current += 2;
          } else { value += ch; current++; }
        }
        if (current === text.length) throw new LangSyntaxError('E_STRING', 'unterminated string literal', source.span(start, current));
        current++; emit('string', start, value); continue;
      }
      const pair = current + 1 < text.length ? symbolMap.get(text.slice(current, current + 2)) : undefined;
      const kind = pair ?? symbolMap.get(c);
      if (!kind) {
        // Report a whole code point: a non-BMP character is two UTF-16 units.
        const character = String.fromCodePoint(text.codePointAt(current) ?? 0);
        throw new LangSyntaxError('E_CHARACTER', `unexpected character '${character}'`, source.span(current, current + character.length));
      }
      current += pair ? 2 : 1; emit(kind, start);
    }
  } catch (error) {
    if (error instanceof RangeError) throw new LangSyntaxError('E_INPUT_LIMIT', 'host syntax limit exceeded', source.span(Math.min(current, text.length)));
    throw error;
  }
  tokens.push({ kind: 'EOF', lexeme: '', span: source.span(text.length) });
  return tokens;
}
