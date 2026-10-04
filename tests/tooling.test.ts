import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('T-STATIC-1 explicit any scanner', () => {
  it.each(['let x: any;', 'type X = any;', 'let x = 1 as any;', 'let x = <any>1;'])('rejects %s', (source) => {
    const directory = mkdtempSync(join(tmpdir(), 'mini-lang-any-'));
    try {
      writeFileSync(join(directory, 'case.ts'), source);
      const result = spawnSync(process.execPath, ['scripts/check-any.mjs', directory], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/case.ts:1:\d+: explicit any/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('ignores comments and strings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mini-lang-any-'));
    try {
      writeFileSync(join(directory, 'case.ts'), '// any\nconst value = "any";');
      expect(spawnSync(process.execPath, ['scripts/check-any.mjs', directory]).status).toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
