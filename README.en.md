# Mini-Lang

[한국어](./README.md) | **English**

An educational tree-walk interpreter written from scratch in TypeScript. A hand-written Lexer and a recursive-descent Parser keep source positions, and the interpreter runs functions, closures, recursion and arrays through lexical environments and mutable bindings.

## Install and run

Requires Node.js 20 or later and npm. Verified on Windows with Node 20.20.2 and 24.16.0. Run the commands from the project root. If the PowerShell execution policy blocks `npm`, use `npm.cmd` instead.

```sh
npm ci
npm run run -- examples/01-hello-world.lang
npm run repl
```

Both commands build the TypeScript sources first. To run an existing build directly:

```sh
npm run build
node dist/cli/run.js examples/14-bubble-sort.lang
node dist/cli/repl.js
```

A script writes only `print` output to stdout. Language errors go to stderr with exit code 1; usage, file I/O and internal errors exit with code 2; a normal run exits with 0.

## Language example

```mini-lang
fn makeCounter() {
  let n = 0;
  fn next() {
    n = n + 1;
    return n;
  }
  return next;
}
let counter = makeCounter();
print(counter(), counter());

let values = [3, 1, 2];
values[0] = 10;
print(values, len(values));
```

Output:

```text
1 2
[10, 1, 2] 3
```

Values are finite numbers, strings, booleans, null, arrays, user functions and builtins. Variables are declared with `let x = expr;` and functions with `fn name(args) { ... }`. The language has `if/else`, `while`, `return`, assignment, arithmetic, comparison and logical operators, array reads and writes, and chained calls. `print` and `len` are the only builtins.

A name cannot be redeclared in the same scope. When a scope is entered, its functions are initialized first, while a `let` is initialized when its declaration runs. A function can therefore be called before its declaration, but reading or writing an uninitialized `let` is an error. A closure shares the same binding as its declaring environment, and separate calls to a factory get independent state.

Only `false` and `null` are falsy; 0, the empty string and the empty array are truthy. `&&` and `||` short-circuit and return the selected operand. There are no implicit conversions between types: `+` accepts two numbers or two strings only. Arrays and functions compare by reference.

## REPL

```text
> let x=1;
> x=x+1
2
> fn twice(n) {
... return n*2;
... }
> twice(x)
4
```

- Globals and closure state persist across inputs, and the session keeps accepting input after a language error.
- The prompt is `> `, and the continuation prompt is `... `. No prompt is shown when stdin is a pipe.
- Only the `;` of the last top-level expression may be omitted. `let`, `return` and statements inside a block need their semicolons.
- The result of a top-level expression is shown unless it is null. An explicit semicolon does not hide it. `print` returns null, so its output is not echoed twice.
- A complete input runs exactly once. `1+` waits for the next line, but invalid syntax or an unterminated string is an error immediately.
- An `if` statement is complete at its `}`, so to continue with `else`, type `} else {` or `} else` on the same line.
- A syntax error runs nothing. Output and changes made before a runtime error are kept. After `let a=1;let b=1/0;`, a is 1 and b stays in the TDZ, so it can be neither redeclared nor assigned. Use a new name or restart the REPL.
- Ctrl+C while waiting for input cancels the pending input. EOF exits; if incomplete input remains, it reports an error and exits with 1. An infinite loop in synchronous execution cannot be cancelled while keeping the session.

## Verification

```sh
npm run check
npm run test:integration
npm run test:examples
```

`check` runs the full Vitest suite, a strict typecheck and an explicit-`any` check over `src/`. `check:any` finds `AnyKeyword` nodes with the TypeScript compiler API, so `any` inside comments or strings is not a false positive. There are no explicit `any` exceptions. Running the tests builds `src` once to verify the compiled CLI.

Risky executions run in a separate child process under a parent deadline; the suite does not rely on the Vitest timeout alone to stop a synchronous loop. The [risk coverage table](RISK_COVERAGE.md) maps 40 risks to real tests, and the [progress log](PROGRESS.md) records test counts, environments, commits and resume state.

## Examples

Every `.lang` file is discovered automatically and its full stdout is compared with the `.expected` file of the same stem. Only CRLF is normalized to LF; whitespace and the final newline are preserved. A missing or orphaned `.expected` file, or fewer than 15 examples, fails the run.

| File | Content |
|---|---|
| `01-hello-world.lang` | Printing a string |
| `02-variables-arithmetic.lang` | Variables and operator precedence |
| `03-conditionals.lang` | if/else |
| `04-while-loop.lang` | Loops and accumulation |
| `05-fizzbuzz.lang` | FizzBuzz 1–15 |
| `06-factorial.lang` | Recursive factorial |
| `07-fibonacci-recursive.lang` | Recursive Fibonacci |
| `08-fibonacci-iterative.lang` | Iterative Fibonacci |
| `09-closure-counter.lang` | A closure that keeps state |
| `10-nested-closures.lang` | Nested captures |
| `11-lexical-shadowing.lang` | Lexical scope and shadowing |
| `12-array-operations.lang` | Array reads, writes and length |
| `13-array-traversal.lang` | Array traversal |
| `14-bubble-sort.lang` | Bubble sort written in Mini-Lang |
| `15-recursion-array-sum.lang` | Recursion over an array |

## Structure and documents

```text
src/
  source-location.ts, token.ts, lexer.ts, ast.ts, parser.ts
  runtime-values.ts, value-format.ts, environment.ts, interpreter.ts
  builtins.ts, errors.ts, runner.ts, repl.ts
  cli/run.ts, cli/repl.ts
tests/                 unit, regression and integration tests, process helpers
examples/              15 programs and their expected output
scripts/check-any.mjs   explicit-any check
```

The pipeline is Source → Tokens → AST → Interpreter → RuntimeValue. ASTs and values are discriminated unions, execution uses exhaustive switches, `return` travels as a completion record, and errors are source-aware exceptions. I/O is injected through the runner's output callback and the REPL ports, which keeps the Node file and terminal dependencies in the CLI.

See [SPEC](SPEC.md) for the full rules, [GRAMMAR](GRAMMAR.md) for the EBNF, [ARCHITECTURE](ARCHITECTURE.md) for module responsibilities, [LIMITATIONS](LIMITATIONS.md) for the constraints and [FUTURE](FUTURE.md) for unimplemented extensions. `DESIGN_REVIEW.md` is kept as the original design fixed before implementation.

## Development process and AI collaboration

This project made extensive use of AI tools for design, implementation, testing, review and documentation. The design documents, the implementation and the initial verification were done by an AI model (Astra); the [blind review](CLAUDE_BLIND_REVIEW.md) and the [cross-model review](CROSS_MODEL_REVIEW.md) were performed by a different AI model (Claude). All of these reviews were done by AI models; none of them is a code review by a human reviewer.

The author defined the staged work instructions and completion criteria, requested repeated reviews, and verified the results before accepting them. The repository keeps the design decisions ([DESIGN_REVIEW](DESIGN_REVIEW.md)), the mapping from risks to tests ([RISK_COVERAGE](RISK_COVERAGE.md)), the review and fuzzing records ([ADVERSARIAL_REVIEW](ADVERSARIAL_REVIEW.md), [FUZZ_REVIEW](FUZZ_REVIEW.md)) and the known limitations ([LIMITATIONS](LIMITATIONS.md)).

## About this public repository

This repository starts from the final validated state rather than the full development history. Seven-character commit hashes in [PROGRESS](PROGRESS.md), the review reports and `docs/study/` (for example `5c248fe`) refer to the private development history and cannot be looked up here. The figures and conclusions are as recorded at those points; the source and tests in this repository are identical to the last development commit.

Most design, review and study documents in this repository are written in Korean.

## License

MIT. See [LICENSE](LICENSE).
