import { unreachable } from './errors.js';
import type { ArrayValue, RuntimeValue } from './runtime-values.js';
export function formatValue(value: RuntimeValue): string {
  const active = new Set<ArrayValue>();
  function display(item: RuntimeValue, depth: number, quoted: boolean): string {
    switch (item.tag) {
      case 'number': return String(item.value);
      case 'string': return quoted ? JSON.stringify(item.value) : item.value;
      case 'boolean': return String(item.value);
      case 'null': return 'null';
      case 'user-function': return `<fn ${item.name}>`;
      case 'builtin': return `<builtin ${item.name}>`;
      case 'array': {
        if (active.has(item)) return '<cycle>';
        if (depth >= 64) return '<max-depth>';
        active.add(item);
        try { return `[${item.elements.map(element => display(element, depth + 1, true)).join(', ')}]`; }
        finally { active.delete(item); }
      }
      default: return unreachable(item);
    }
  }
  return display(value, 0, false);
}
