export interface Position { readonly offset: number; readonly line: number; readonly column: number }
export interface Span { readonly source: SourceUnit; readonly start: Position; readonly end: Position }
let nextSourceId = 1;
export class SourceUnit {
  readonly lineStarts: readonly number[];
  constructor(readonly text: string, readonly displayName = '<source>', readonly id = `source:${nextSourceId++}`) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\r') { if (text[i + 1] === '\n') i++; starts.push(i + 1); }
      else if (text[i] === '\n') starts.push(i + 1);
    }
    this.lineStarts = starts;
  }
  position(offset: number): Position {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.text.length) throw new RangeError('invalid source offset');
    let low = 0, high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.lineStarts[middle] ?? 0) <= offset) low = middle; else high = middle;
    }
    const bom = low === 0 && this.text[0] === '\uFEFF' && offset > 0 ? 1 : 0;
    return { offset, line: low + 1, column: offset - (this.lineStarts[low] ?? 0) + 1 - bom };
  }
  span(start: number, end = start): Span { return { source: this, start: this.position(start), end: this.position(end) }; }
  lineText(line: number): string {
    const start = this.lineStarts[line - 1];
    if (start === undefined) return '';
    const text = this.text.slice(start, this.lineStarts[line] ?? this.text.length).replace(/[\r\n]+$/, '');
    return line === 1 ? text.replace(/^\uFEFF/, '') : text;
  }
}
export function combine(start: Span, end: Span): Span { return { source: start.source, start: start.start, end: end.end }; }
