# Code Walkthrough

[학습 목차](README.md) · 이전 단계: [Chapter Checkpoints](CHAPTER_CHECKPOINTS.md)

교재는 개념별로 나뉘어 있다. 이 문서는 **실제 코드를 실행 순서대로** 따라 읽는 안내서다. 면접에서 "코드를 보여 주며 설명해 보라"고 할 때 열어 둘 파일과 줄, 그리고 각 지점에서 말할 내용을 정리했다.

- 기준: HEAD `5c248fe`. 줄 번호(`L12–17`)는 이 커밋 기준이며, 코드가 바뀌면 함수 이름으로 다시 찾는다.
- 인용한 코드는 실제 소스에서 **그대로** 가져왔다. 줄을 생략할 때만 `// …`로 표시했다.
- 각 절 끝의 "말해 볼 것"을 소리 내어 설명하고, "직접 확인"은 코드나 테스트에서 실제로 찾아 본다.

## 전체 경로 한눈에 보기

```text
cli/run.ts main ─▶ runner.ts runScript ─▶ createSession / SourceUnit
                                   └▶ runSource ─▶ compile ─▶ parser.ts parse ─▶ lexer.ts lex
                                                 └▶ execute ─▶ interpreter.ts Interpreter.execute
                                                                 ├ prepare            (06)
                                                                 ├ list / statement   (07)
                                                                 ├ evaluate: Assign / Call / Index (08·09)
                                                                 └ guard / rethrowRuntime        (10b)
                                     environment.ts lookup / reference ◀─┘
                                     runtime-values.ts truthy / equal / binary
                                     builtins.ts print ─▶ value-format.ts formatValue ─▶ output callback
repl.ts Repl.submitLine ─▶ parser.ts classify ─▶ runner.ts execute(…, echo)
```

| 단계 | 파일 | 읽을 함수 | 교재 |
|---|---|---|---|
| W1 | [cli/run.ts](../../src/cli/run.ts), [runner.ts](../../src/runner.ts) | `main`, `createSession`, `runSource` | 01·11 |
| W2 | [source-location.ts](../../src/source-location.ts) | `SourceUnit` constructor, `position` | 02 |
| W3 | [lexer.ts](../../src/lexer.ts) | `lex` | 02 |
| W4 | [parser.ts](../../src/parser.ts) | `nested`, `node`, `assignment`, `binary`, `postfix`, `statement`, `classify` | 03·04·11 |
| W5 | [interpreter.ts](../../src/interpreter.ts) | `execute`, `prepare`, `guard` | 06·10b |
| W6 | [interpreter.ts](../../src/interpreter.ts) | `statement` | 07 |
| W7 | [interpreter.ts](../../src/interpreter.ts) | `evaluate`의 Assign, `indexReference` | 09 |
| W8 | [interpreter.ts](../../src/interpreter.ts) | `evaluate`의 Call | 08 |
| W9 | [environment.ts](../../src/environment.ts) | `lookup`, `reference` | 06 |
| W10 | [value-format.ts](../../src/value-format.ts) | `display`의 array 분기 | 09 |
| W11 | [repl.ts](../../src/repl.ts) | `submitLine`, `endInput` | 11 |

---

## W1. 입구: CLI와 Runner

[cli/run.ts](../../src/cli/run.ts) L6–20:

```ts
process.stdout.on('error', error => { process.exitCode = 2; process.stderr.write(`IOError: ${error.message}\n`); });
process.stderr.on('error', () => { process.exitCode = 2; });
function main(): number {
  // …
  try { runScript(text, basename(path), text => process.stdout.write(text)); return 0; }
  catch (error) {
    if (error instanceof LangError) { process.stderr.write(formatError(error) + '\n'); return 1; }
    process.stderr.write(`InternalError: ${error instanceof Error ? error.message : String(error)}\n`); return 2;
  }
}
process.exitCode = main();
```

**말해 볼 것**
- exit code는 세 가지다. `LangError` 계열이면 1, 나머지 host 오류는 `InternalError`와 2, 사용법·파일 I/O·닫힌 출력 스트림도 2다.
- `runScript`에 넘기는 마지막 인수가 출력 callback이다. 테스트에서는 이 자리에 문자열을 모으는 함수를 넣는다.
- `'error'` 리스너 두 줄은 BR-02 수정이다. 없으면 `| head`처럼 출력이 닫힐 때 Node stack trace가 나오고 exit 1이 된다.

[runner.ts](../../src/runner.ts)의 `runSource`는 한 줄이다. `execute(compile(source), session);` 인수인 `compile`이 먼저 실행되므로 구문 오류가 있으면 실행이 시작되지 않는다.

**직접 확인**: `createSession`에서 builtin cell을 `reserve(..., false)`로 만드는 부분을 찾아 readonly의 근거를 확인한다.

## W2. 위치 모델: SourceUnit

[source-location.ts](../../src/source-location.ts) L6–23:

```ts
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
```

**말해 볼 것**
- `id`의 기본값은 생성 순번이다. 표시 이름과 분리한 이유는 AR-02다.
- CRLF는 `i++`로 두 글자를 한 번에 넘겨 한 줄로 센다. CR 단독도 한 줄이다. 원문은 바꾸지 않는다.
- `position`은 이진 탐색이라 O(log 줄 수)다. BOM 보정은 첫 줄에만 적용한다.
- 범위 밖 offset의 `RangeError`는 API 인수 검증이다. 정상 실행에서는 발생하지 않는다.

## W3. Lexer: 진행과 오류

[lexer.ts](../../src/lexer.ts) L15–20, L52–64:

```ts
  try {
    while (current < text.length) {
      const start = current, c = text[current] ?? '';
      if (' \t\r\n'.includes(c)) { current++; continue; }
      if (c === '/' && text[current + 1] === '/') {
        while (current < text.length && !'\r\n'.includes(text[current] ?? '')) current++;
// …
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
```

**말해 볼 것**
- 모든 분기는 `current`를 늘리거나 throw한다. 그래서 lexer는 hang하지 않는다.
- longest match는 `pair ?? symbolMap.get(c)` 한 줄이다.
- 불법 문자 메시지는 code point 전체를 쓴다(BR-01). 시작 위치는 UTF-16 offset 그대로다.
- lexer의 `RangeError`는 SyntaxError `E_INPUT_LIMIT`가 된다. interpreter의 `E_HOST_LIMIT`와 다르다.

**직접 확인**: 숫자 분기에서 `E_NUMBER`(suffix와 not finite)를 내는 두 줄과, 문자열 분기에서 `E_STRING`/`E_ESCAPE`를 내는 세 줄을 찾는다(02장 오류 표와 대조).

## W4. Parser: 우선순위, 대입, postfix, 자원 제한

[parser.ts](../../src/parser.ts) L23–33 — 두 종류의 제한:

```ts
  private nested<T>(operation: () => T): T {
    if (this.nesting >= 64) throw new LangSyntaxError('E_INPUT_LIMIT', 'syntax nesting limit (64) exceeded', this.peek().span);
    this.nesting++;
    try { return operation(); } finally { this.nesting--; }
  }
  private node<T extends { kind: string }>(data: T, start: Span, end: Span, children: readonly NodeBase[] = []): T & NodeBase {
    let height = 1;
    for (const child of children) height = Math.max(height, child.height + 1);
    if (height > 128) throw new LangSyntaxError('E_INPUT_LIMIT', 'AST depth limit (128) exceeded', start);
    return { ...data, span: combine(start, end), height };
  }
```

L112–127 — 오른쪽 결합 대입과 왼쪽 결합 이항 연산:

```ts
  private assignment(): Expr {
    const target = this.or();
    if (!this.match('=')) return target;
    const anchor = this.previous().span;
    if (target.kind !== 'Identifier' && target.kind !== 'Index') throw new LangSyntaxError('E_ASSIGN_TARGET', 'invalid assignment target', anchor);
    const value = this.nested(() => this.assignment());
    return this.node({ kind: 'Assign', target, value, anchor }, target.span, value.span, [target, value]);
  }
  private binary(next: () => Expr, operators: readonly TokenKind[], kind: 'Binary' | 'Logical' = 'Binary'): Expr {
    let left = next();
    while (operators.includes(this.peek().kind)) {
      const operator = this.advance(), right = next();
      left = this.node({ kind, left, right, operator: operator.lexeme, anchor: operator.span }, left.span, right.span, [left, right]);
    }
    return left;
  }
```

L146–157 — postfix 체인:

```ts
  private postfix(): Expr {
    let expression = this.primary();
    while (true) {
      if (this.match('(')) {
        const anchor = this.previous().span, args = this.list(')');
        expression = this.node({ kind: 'Call', callee: expression, args, anchor }, expression.span, this.previous().span, [expression, ...args]);
      } else if (this.match('[')) {
        const anchor = this.previous().span, index = this.nested(() => this.expression()); this.expect(']');
        expression = this.node({ kind: 'Index', base: expression, index, anchor }, expression.span, this.previous().span, [expression, index]);
      } else return expression;
    }
  }
```

L100–102와 L179–185 — REPL 모드와 입력 분류:

```ts
    const expression = this.expression();
    const end = topLevel && this.mode === 'repl' && this.peek().kind === 'EOF' ? expression.span : this.expect(';').span;
    return this.node({ kind: 'Expression', expression }, expression.span, end, [expression]);
// …
export function classify(source: SourceUnit): ParseResult {
  try { return { kind: 'complete', program: parse(source, 'repl') }; }
  catch (error) {
    if (error instanceof LangSyntaxError) return { kind: error.incompleteCandidate ? 'incomplete' : 'invalid', error };
    throw error;
  }
}
```

**말해 볼 것**
- `nested`는 **진입 전 `>= 64`** 검사라 64개 edge까지 허용한다. `node`는 **계산 후 `> 128`** 검사라 높이 128까지 허용한다.
- `assignment`는 LHS를 `or()`로 **먼저 파싱한 뒤** kind를 검사한다. 그래서 `1+2 =`는 RHS를 기다리지 않고 `=`에서 거절된다. RHS는 재귀 호출이라 오른쪽 결합이다.
- `binary`의 `while`이 `left`를 계속 감싸 왼쪽 결합 트리를 만든다. 우선순위는 `next` 인수로 넘기는 아래 계층 함수가 결정한다.
- `postfix`의 각 노드 anchor는 `(` 또는 `[`이며, 진단 위치(10a)와 연결된다.
- REPL에서 세미콜론을 생략할 수 있는 조건은 "최상위이고, repl 모드이고, 다음 토큰이 EOF"뿐이다. incomplete 판정은 오류 객체의 `incompleteCandidate`만 본다.

**직접 확인**: `expect`에서 `incompleteCandidate`를 `t.kind === 'EOF'`로 설정하는 부분과, `registerName`이 중복 시 `E_DUPLICATE`를 던지는 부분을 찾는다.

## W5. Interpreter 진입: execute, prepare, guard

[interpreter.ts](../../src/interpreter.ts) L11–37:

```ts
  execute(program: Program, environment: Environment, echo?: (value: RuntimeValue) => void): void {
    try {
      this.prepare(program.statements, environment);
      const result = this.list(program.statements, environment, echo);
      if (result.kind !== 'normal') throw new Error('top-level return escaped parser validation');
    } catch (error) { this.rethrowRuntime(error, program.span); }
  }
  private rethrowRuntime(error: unknown, span: Span): never {
    if (error instanceof RangeError) throw new LangRuntimeError('E_HOST_LIMIT', 'host runtime limit exceeded', span, { cause: error });
    throw error;
  }
  private prepare(statements: readonly Stmt[], env: Environment): void {
    for (const stmt of statements) {
      if ((stmt.kind === 'Let' || stmt.kind === 'Function') && env.hasOwn(stmt.name.text)) throw new LangRuntimeError('E_REDECLARE', `name '${stmt.name.text}' is already declared in this scope`, stmt.name.span);
    }
    for (const stmt of statements) if (stmt.kind === 'Let' || stmt.kind === 'Function') env.reserve(stmt.name.text, stmt.name.span);
    for (const stmt of statements) if (stmt.kind === 'Function') {
      env.initialize(stmt.name.text, { tag: 'user-function', name: stmt.name.text, declaration: stmt, closure: env, arity: { min: stmt.params.length, max: stmt.params.length } });
    }
  }
  private guard<T>(span: Span, operation: () => T): T {
    if (this.evaluationDepth >= 256) throw new LangRuntimeError('E_EVAL_DEPTH', 'evaluation nesting limit (256) exceeded', span);
    this.evaluationDepth++;
    try { return operation(); }
    catch (error) { this.rethrowRuntime(error, span); }
    finally { this.evaluationDepth--; }
  }
```

**말해 볼 것**
- `prepare`의 세 for 루프가 각각 다음을 한다. 이것이 hoisting, TDZ, REPL preflight의 전부다.
  1. 기존 own 이름과 충돌하면 아무것도 예약하지 않고 중단한다(`E_REDECLARE`).
  2. 모든 직접 let/fn을 uninitialized로 예약한다.
  3. fn만 `closure: env`로 초기화한다.
- echo는 Program 최상위 `list`에만 전달된다. 블록이나 함수 body에는 전달되지 않는다.
- `guard`는 모든 `statement`/`evaluate` 진입을 감싼다. 진입 전 `>= 256` 검사가 있고, `finally`에서 감소하며, `catch`에서 `RangeError`를 변환한다. 가장 안쪽 guard가 먼저 변환하고, 이미 `LangError`이면 그대로 다시 던진다.
- `execute`의 catch는 `prepare`처럼 guard 밖에서 생긴 `RangeError`를 받는 마지막 방어다(T-SAFE-2).

## W6. 문장 실행과 return 전파

[interpreter.ts](../../src/interpreter.ts) L45–62:

```ts
  private statement(stmt: Stmt, env: Environment, echo?: (value: RuntimeValue) => void): Completion {
    return this.guard(stmt.span, () => {
      switch (stmt.kind) {
        case 'Expression': { const value = this.evaluate(stmt.expression, env); echo?.(value); return NORMAL; }
        case 'Let': env.initialize(stmt.name.text, this.evaluate(stmt.initializer, env)); return NORMAL;
        case 'Function': return NORMAL;
        case 'Return': return { kind: 'return', value: stmt.value ? this.evaluate(stmt.value, env) : NULL };
        case 'Block': { const child = new Environment(env); this.prepare(stmt.statements, child); return this.list(stmt.statements, child); }
        case 'If': return truthy(this.evaluate(stmt.condition, env)) ? this.statement(stmt.thenBranch, env) : stmt.elseBranch ? this.statement(stmt.elseBranch, env) : NORMAL;
        case 'While': {
          while (truthy(this.evaluate(stmt.condition, env))) {
            const result = this.statement(stmt.body, env); if (result.kind === 'return') return result;
          }
          return NORMAL;
        }
        default: return unreachable(stmt);
      }
    });
  }
```

**말해 볼 것**
- `Let`은 initializer가 성공했을 때만 `initialize`한다. 실패하면 cell은 TDZ로 남는다(REPL의 `let b=1/0;`).
- `Function` 문장은 no-op이다. 이미 `prepare`에서 초기화했기 때문이다.
- `Block`은 매번 새 `Environment`를 만든다. while body도 Block이므로 반복마다 새 환경이 생긴다. 다만 body 바깥에 선언된 변수는 parent의 cell을 갱신한다.
- return completion은 `Return` → (`list`) → `Block` → `If` → (while body `Block`) → `While` → 함수 body `list`로 그대로 전달된다. W8의 Call에서 소비된다.

**직접 확인**: `list` 메서드(L38–44)에서 `result.kind === 'return'`이면 남은 문장을 건너뛰는 줄을 찾는다.

## W7. 대입 순서와 index

[interpreter.ts](../../src/interpreter.ts) L81–88, L121–128:

```ts
        case 'Assign': {
          if (expr.target.kind === 'Identifier') {
            const cell = env.reference(expr.target.name, expr.target.span, true);
            const value = this.evaluate(expr.value, env); cell.state = { kind: 'initialized', value }; return value;
          }
          const {array,index} = this.indexReference(expr.target,env);
          const value = this.evaluate(expr.value,env); array.elements[index] = value; return value;
        }
// …
  private indexReference(expr: Index, env: Environment): { array: ArrayValue; index: number } {
    const array = this.evaluate(expr.base,env);
    if (array.tag !== 'array') throw new LangTypeError('E_INDEX_BASE', `cannot index value of type ${typeName(array)}`, expr.anchor);
    const index = this.evaluate(expr.index,env);
    if (index.tag !== 'number' || !Number.isInteger(index.value)) throw new LangTypeError('E_INDEX_TYPE', 'array index must be an integer number', expr.index.span);
    if (index.value < 0 || index.value >= array.elements.length) throw new LangRuntimeError('E_INDEX_RANGE', `array index ${index.value} out of bounds for length ${array.elements.length}`, expr.index.span);
    return { array, index: index.value };
  }
```

**말해 볼 것**
- 두 경로 모두 **대상 확정·검증 → RHS 평가 → 저장** 순서다. Identifier 경로는 `Environment.assign`이 아니라 `reference(..., true)`로 cell을 먼저 얻는다.
- `indexReference`의 검사 순서는 base → 배열 여부 → index → 정수 → 범위다. base가 틀리면 index 식은 평가되지 않는다.
- 진단 위치는 base 오류가 `expr.anchor`(`[`), index 오류가 `expr.index.span`(index 식의 시작)이다.
- 대입식의 값은 저장한 RHS 값이므로 `a=b=3`과 `a[0]=(a=[9])`가 그렇게 동작한다.

**직접 확인**: 이 순서를 지키는 테스트는 `tests/arrays.test.ts`(T-ASG-3/4)와 `tests/blind-review.test.ts`(BRC-06)다. 두 테스트가 각각 어느 경로(Index, Identifier)를 지키는지 확인한다.

## W8. 호출

[interpreter.ts](../../src/interpreter.ts) L95–116:

```ts
        case 'Call': {
          const callee = this.evaluate(expr.callee,env);
          if (callee.tag !== 'user-function' && callee.tag !== 'builtin') throw new LangTypeError('E_NOT_CALLABLE', `value of type ${typeName(callee)} is not callable`, expr.anchor);
          if (expr.args.length < callee.arity.min || (callee.arity.max !== null && expr.args.length > callee.arity.max)) {
            const count = callee.arity.max === callee.arity.min ? String(callee.arity.min) : `at least ${callee.arity.min}`;
            throw new LangRuntimeError('E_ARITY', `function '${callee.name}' expects ${count} arguments but got ${expr.args.length}`, expr.anchor);
          }
          const args = expr.args.map(arg => this.evaluate(arg,env));
          if (callee.tag === 'builtin') return callee.invoke(args,expr.anchor);
          if (this.callDepth >= 64) throw new LangRuntimeError('E_CALL_DEPTH', 'maximum call depth (64) exceeded', expr.anchor);
          this.callDepth++;
          try {
            const frame = new Environment(callee.closure);
            callee.declaration.params.forEach((param,index) => {
              const value = args[index]; if (value === undefined) throw new Error('arity invariant violated');
              frame.reserve(param.text,param.span); frame.initialize(param.text,value);
            });
            this.prepare(callee.declaration.body.statements,frame);
            const result = this.list(callee.declaration.body.statements,frame);
            return result.kind === 'return' ? result.value : NULL;
          } finally { this.callDepth--; }
        }
```

**말해 볼 것**
- 순서: callee → callable 검사 → arity(인수 **식의 개수**) → 인수 좌→우 평가 → builtin은 즉시 `invoke` → user만 depth 검사, 증가, frame 생성.
- arity 오류는 인수 평가 **전**이고, depth 오류는 인수 평가 **후**다. 그래서 부수 효과가 다르다(ADV-06).
- `new Environment(callee.closure)` 한 줄이 lexical scope를 결정한다. 호출자 env는 인수 평가에만 쓰인다.
- 함수 body는 별도 Block으로 실행하지 않고 frame에 직접 `prepare`한다. 그래서 매개변수와 body 최상위 선언이 같은 scope다.
- return completion은 여기서만 값으로 바뀐다. 끝까지 실행되거나 bare return이면 `NULL`이다.

## W9. 이름 조회

[environment.ts](../../src/environment.ts) L19–33:

```ts
  private lookup(name: string, span: Span): BindingCell {
    let scope: Environment | null = this;
    while (scope) {
      const cell = scope.bindings.get(name);
      if (cell) return cell;
      scope = scope.parent;
    }
    throw new LangRuntimeError('E_UNDEFINED', `undefined variable '${name}'`, span);
  }
  reference(name: string, span: Span, writing = false): BindingCell {
    const cell = this.lookup(name, span);
    if (cell.state.kind === 'uninitialized') throw new LangRuntimeError('E_TDZ', `variable '${name}' accessed before initialization`, span);
    if (writing && !cell.mutable) throw new LangRuntimeError('E_READONLY', `cannot assign to read-only binding '${name}'`, span);
    return cell;
  }
```

**말해 볼 것**
- `lookup`은 **가장 가까운 cell에서 멈춘다**. 그 cell이 uninitialized여도 부모로 넘어가지 않는다. 이것이 shadowing과 TDZ가 scope 전체에 적용되는 이유다.
- 비용은 O(체인 깊이)다. 각 scope는 `Map`이라 같은 scope 안의 이름 수에는 크게 영향받지 않는다(13장 prepopulated REPL 측정과 연결).
- 검사 순서는 undefined → TDZ → readonly다.

## W10. 배열 출력

[value-format.ts](../../src/value-format.ts) L13–19:

```ts
      case 'array': {
        if (active.has(item)) return '<cycle>';
        if (depth >= 64) return '<max-depth>';
        active.add(item);
        try { return `[${item.elements.map(element => display(element, depth + 1, true)).join(', ')}]`; }
        finally { active.delete(item); }
      }
```

**말해 볼 것**
- `active`는 **현재 경로**의 배열 집합이다. `finally`에서 지우므로 형제 위치의 같은 배열은 cycle이 아니다.
- root depth가 0이므로 64층까지 표시하고, 65번째 배열은 `<max-depth>`다.
- 세 번째 인수 `true`(quoted) 때문에 배열 안 문자열은 JSON 형식이 되고, 최상위 문자열은 원문 그대로다.

## W11. REPL core

[repl.ts](../../src/repl.ts) L19–37:

```ts
  submitLine(line: string): void {
    this.lines.push(line);
    const result = classify(this.source());
    if (result.kind === 'incomplete') { this.ports.showPrompt('... '); return; }
    this.clear();
    if (result.kind === 'invalid') this.ports.writeDiagnostic(formatError(result.error) + '\n');
    else if (result.kind === 'complete') {
      try { execute(result.program, this.session, value => { if (value.tag !== 'null') this.ports.writeOutput(formatValue(value) + '\n'); }); }
      catch (error) { if (error instanceof LangError) this.ports.writeDiagnostic(formatError(error) + '\n'); else throw error; }
    }
    this.ports.showPrompt('> ');
  }
  cancelInput(): void { this.clear(); this.ports.showPrompt('> '); }
  endInput(): number {
    if (this.lines.length === 0) return 0;
    const result = classify(this.source()); this.clear();
    if (result.kind !== 'complete') { this.ports.writeDiagnostic(formatError(result.error) + '\n'); return 1; }
    return 0;
  }
```

**말해 볼 것**
- 매 줄 버퍼 **전체**를 다시 분류한다(긴 pending 입력에서는 O(n²)). incomplete면 버퍼를 유지하고, 그 밖의 경우 `clear()`로 버퍼를 비우고 submission 번호를 늘린다.
- 실행에는 생성자에서 한 번 만든 `this.session`을 계속 쓴다. global과 Interpreter 카운터가 submission 사이에 유지된다.
- echo callback이 null을 걸러낸다. 언어 오류는 진단 채널로 보내고, 그 밖의 오류는 다시 던져 adapter가 `InternalError`로 처리한다.
- `endInput`의 반환값(0/1)이 `cli/repl.ts` close 핸들러를 거쳐 exit code가 된다.

---

## 따라가기 연습

아래 세 경로를 위 W 절만 보면서 말로 추적한다. 막히면 해당 W 절과 교재 장을 다시 읽는다.

### 연습 1. 함수 안의 타입 오류가 exit code 1이 되기까지

```mini-lang
fn add(a, b) {
  return a + b;
}
print(add(1, "x"));
```

추적할 지점:
1. W5 `prepare`가 add를 초기화한다.
2. W6 Expression 문장 → W8 print Call의 인수를 평가하다가 add Call로 들어간다(새 frame).
3. W6 Return → `evaluate` Binary → `runtime-values.ts`의 `binary`가 `E_OPERAND`를 던진다. anchor는 2행의 `+`(column 12)다.
4. 안쪽부터 각 guard의 catch는 `LangError`를 그대로 다시 던지고, `finally`가 카운터를 줄인다.
5. W1 `main`이 `formatError`를 출력하고 1을 반환한다. print는 실행되지 않았으므로 stdout은 비어 있다.

### 연습 2. REPL에서 함수를 두 줄에 걸쳐 입력할 때

```text
> fn f(){
... return 1;
... }
> f()
1
```

추적할 지점:
1. W11 `submitLine`이 첫 줄을 classify한다. W4 `block`의 `expect('}')`가 EOF에서 `incompleteCandidate`로 실패해 incomplete가 된다.
2. 셋째 줄에서 complete가 되면 W5 `execute`가 실행하고, `prepare`가 f를 global에 초기화한다.
3. `f()`는 W4 repl 모드라 세미콜론 없이 complete가 된다. W6 Expression 문장의 echo로 `1`이 출력된다.

### 연습 3. `let a=[0]; let i=0; fn idx(){ i=i+1; return 0; } a[idx()]=(i=i+10); print(i,a[0]);`

추적할 지점:
1. W7 Assign의 Index 경로에서 `indexReference`가 base a → `idx()` 호출(i=1) → 범위 검사 순서로 `(배열, 0)`을 확정한다.
2. RHS `(i=i+10)`이 i를 11로 만들고 11을 반환한다.
3. 확정해 둔 0번에 11을 저장한다. 출력은 `11 11`이다. `idx()`는 한 번만 호출된다(T-ASG-3).

## 다음 단계

세 연습을 막힘없이 설명할 수 있으면 학습 경로를 마친 것이다. 막힌 경로가 있으면 해당 장의 3·5절로 돌아간다.
