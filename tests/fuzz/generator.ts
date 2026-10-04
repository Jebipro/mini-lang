export interface FuzzCase {
  seed: number;
  index: number;
  category: string;
  text: string;
  grammar: boolean;
  expected?: 'success' | 'E_INPUT_LIMIT' | 'E_CALL_DEPTH' | 'E_EVAL_DEPTH';
}
export class Random {
  constructor(private state: number) {}
  int(limit: number): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) % limit;
  }
  pick<T>(values: readonly T[]): T {
    const value = values[this.int(values.length)];
    if (value === undefined) throw new Error('empty generator choice');
    return value;
  }
}
const literals = ['0', '1', '2.5', 'true', 'false', 'null', '""', '"한😀글"', '"a\\n\\t\\\""'];
const operators = ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>='];
const atoms = [...literals, 'x', 'arr', 'id', 'missing', 'let', 'fn', 'return', 'if', 'else', 'while', '(', ')', '[', ']', '{', '}', ',', ';', '=', ...operators, '&&', '||', '!'];

function expression(r: Random, depth: number): string {
  if (depth === 0) return r.pick([...literals, 'x', 'arr', 'id', 'missing']);
  const child = () => expression(r, depth - 1);
  switch (r.int(10)) {
    case 0: return r.pick(literals);
    case 1: return r.pick(['x', 'arr', 'id', 'missing']);
    case 2: return `(${r.pick(['!', '-', '+'])}${child()})`;
    case 3: return `(${child()} ${r.pick(operators)} ${child()})`;
    case 4: return `(${child()} ${r.pick(['&&', '||'])} ${child()})`;
    case 5: return `(${r.pick(['x', 'arr[0]'])}=${child()})`;
    case 6: return `[${child()},${child()}]`;
    case 7: return `(${child()})[${child()}]`;
    case 8: return `${r.pick(['id', 'len', 'print', '(x)', 'arr[0]'])}(${child()})`;
    default: return `(${child()})`;
  }
}
function program(r: Random): string {
  let next = 0;
  function statement(depth: number, inFunction = false): string {
    const expr = () => expression(r, 1 + r.int(3));
    const name = `local${next++}`;
    if (depth === 0) return inFunction && r.int(3) === 0 ? `return ${expr()};` : `${expr()};`;
    switch (r.int(inFunction ? 7 : 6)) {
      case 0: return `let ${name}=${expr()};`;
      case 1: return `${expr()};`;
      case 2: return `if(${expr()}){${statement(depth - 1, inFunction)}}else{${statement(depth - 1, inFunction)}}`;
      case 3: return `{let ${name}=0;while(${name}<${r.int(4)}){${name}=${name}+1;${statement(depth - 1, inFunction)}}}`;
      case 4: return `fn ${name}(p){${statement(depth - 1, true)}return p;}${name}(1);`;
      case 5: return `{${statement(depth - 1, inFunction)}${statement(depth - 1, inFunction)}}`;
      default: return `return ${expr()};`;
    }
  }
  return 'let x=1;let arr=[0,1];fn id(p){return p;}' + statement(2) + statement(2);
}

export function generate(seed: number, index: number): FuzzCase {
  // Each index has its own stream, so replay does not depend on earlier cases.
  const r = new Random((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const base = { seed, index, grammar: false };
  switch (index % 4) {
    case 0: {
      const chars = 'abc_xyz01239+-*/%=!&|()[]{};,"\\ \t\r\n\uFEFF한😀\0\ud800\udfff';
      let text = '';
      for (let n = r.int(129); n > 0; n--) text += r.int(8) === 0 ? String.fromCharCode(r.int(65536)) : chars[r.int(chars.length)];
      return { ...base, category: 'arbitrary-utf16', text };
    }
    case 1: {
      let text = '';
      for (let n = r.int(65); n > 0; n--) text += r.pick(atoms) + r.pick([' ', '\t', '\r', '\n', '\r\n', '//😀\r\n']);
      return { ...base, category: 'token-source', text };
    }
    case 2: return { ...base, category: 'grammar', text: program(r), grammar: true };
    default: {
      const family = Math.floor(index / 4) % 16;
      const depth = r.pick([0, 1, 62, 63, 64, 65, 66, 125, 126, 127, 128, 129, 256]);
      switch (family) {
        case 0: return { ...base, category: 'parentheses', text: '('.repeat(depth) + '0' + ')'.repeat(depth) + ';', expected: depth <= 64 ? 'success' : 'E_INPUT_LIMIT' };
        case 1: return { ...base, category: 'arrays', text: '['.repeat(depth) + '0' + ']'.repeat(depth) + ';', expected: depth <= 64 ? 'success' : 'E_INPUT_LIMIT' };
        case 2: return { ...base, category: 'unary', text: '!'.repeat(depth) + 'true;', expected: depth <= 64 ? 'success' : 'E_INPUT_LIMIT' };
        case 3: return { ...base, category: 'binary', text: '1+'.repeat(depth) + '1;', expected: depth <= 125 ? 'success' : 'E_INPUT_LIMIT' };
        case 4: return { ...base, category: 'assignment', text: 'let x=0;' + 'x='.repeat(depth) + '1;', expected: depth <= 64 ? 'success' : 'E_INPUT_LIMIT' };
        case 5: return { ...base, category: 'calls', text: r.pick(['f(', 'f(1,', 'f(,)', 'f(1,)', 'f(1 2)', 'f()(']) + r.pick(['', ';', '\r\n', ')']) };
        case 6: return { ...base, category: 'indexing', text: r.pick(['a[', 'a[]', 'a[1,2]', '[0][-1]', '"x"[0]', '[0][0][']) + r.pick(['', ';', ']']) };
        case 7: return { ...base, category: 'strings', text: r.pick(['"', '"abc\\', '"\\q"', '"\\u1234"', '"a\nb"', '"a\rb"', '"\\\n"', '"😀\ud800";']) };
        case 8: return { ...base, category: 'comments-newlines', text: '\uFEFF//😀()[]\rlet x=1;\r\n//"\\\nprint(x);\r//EOF', expected: 'success' };
        case 9: return { ...base, category: 'long-identifier', text: 'let ' + 'a'.repeat(r.pick([1024, 8192, 65536])) + '=1;', expected: 'success' };
        case 10: return { ...base, category: 'long-literal', text: r.pick(['"' + '😀'.repeat(8192) + '";', '0'.repeat(65536) + ';', '9'.repeat(4096) + ';']) };
        case 11: {
          const text = program(r); return { ...base, category: 'eof-prefix', text: text.slice(0, r.int(text.length + 1)) };
        }
        case 12: {
          const n = r.pick([62, 63, 64, 65]);
          return { ...base, category: 'call-depth', text: `fn f(n){if(n==0){return 0;}return f(n-1);}f(${n});`, expected: n <= 63 ? 'success' : 'E_CALL_DEPTH' };
        }
        case 13: return { ...base, category: 'eval-depth', text: `fn f(n){if(true){if(true){if(true){if(n==0){return 0;}return f(n-1);}}}}f(${r.pick([60, 63, 64])});`, expected: 'E_EVAL_DEPTH' };
        case 14: return { ...base, category: 'postfix', text: 'f' + '()'.repeat(depth) + ';', ...(depth > 125 ? { expected: 'E_INPUT_LIMIT' as const } : {}) };
        default: return { ...base, category: 'mutation', text: program(r).replace(r.pick([';', ')', '}', '=']), r.pick(['', ',', ']', '@', '\uFEFF'])) };
      }
    }
  }
}
