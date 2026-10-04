import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
let failures = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name.endsWith('.ts')) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source));
          console.error(`${path}:${position.line + 1}:${position.character + 1}: explicit any`);
          failures++;
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
scan(process.argv[2] ?? 'src');
process.exitCode = failures ? 1 : 0;
