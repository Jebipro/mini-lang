import { execFileSync } from 'node:child_process';
export default function setup(): void {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','-p','tsconfig.build.json'], { stdio: 'pipe', windowsHide: true });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','-p','tsconfig.fuzz.json'], { stdio: 'pipe', windowsHide: true });
}
