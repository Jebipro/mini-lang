import { generate } from './generator.js';
import { checkCase } from './invariants.js';
const seed = Number(process.argv[2]), count = Number(process.argv[3]);
const start = Number(process.argv[4] ?? 0);
const categories: Record<string, number> = {}, outcomes: Record<string, number> = {};
let parsed = 0, executed = 0;
for (let index = start; index < start + count; index++) {
  const input = generate(seed, index);
  await new Promise<void>(resolve => {
    process.once('message', () => resolve());
    process.send?.({ type: 'start', input });
  });
  try {
    const result = checkCase(input);
    parsed += Number(result.parsed); executed += Number(result.executed);
    categories[input.category] = (categories[input.category] ?? 0) + 1;
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  } catch (error) {
    process.send?.({ type: 'failure', error: error instanceof Error ? error.stack : String(error) });
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) process.send?.({ type: 'done', seed, count, parsed, executed, categories, outcomes });
process.disconnect?.();
