import { readdirSync } from 'node:fs';
import { join } from 'node:path';
export function discoverExamples(directory: string, minimum = 15): {name:string;program:string;expected:string}[] {
  const names = readdirSync(directory), programs = names.filter(name => name.endsWith('.lang')).sort();
  if (programs.length < minimum) throw new Error(`expected at least ${minimum} programs`);
  for (const name of names.filter(name => name.endsWith('.expected'))) if (!names.includes(name.replace(/\.expected$/,'.lang'))) throw new Error(`orphan pair: ${name}`);
  return programs.map(name => {
    if (!/^\d{2}-[a-z0-9-]+\.lang$/.test(name)) throw new Error(`invalid example name: ${name}`);
    const expected = name.replace(/\.lang$/,'.expected');
    if (!names.includes(expected)) throw new Error(`missing pair: ${name}`);
    return {name,program:join(directory,name),expected:join(directory,expected)};
  });
}
export function verifyOutput(actual: string, expected: string): void {
  if (actual.replace(/\r\n/g,'\n') !== expected.replace(/\r\n/g,'\n')) throw new Error(`output mismatch: actual ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
