# Chapter Checkpoints

[학습 목차](README.md) · 다음 단계: [Code Walkthrough](CODE_WALKTHROUGH.md)

각 장의 9절 확인 문제를 푼 **뒤에** 사용하는 장별 점검표다. 9절이 "읽은 내용을 기억하는가"를 묻는다면, 이 문서는 "새 입력에 적용하고 코드에서 근거를 찾을 수 있는가"를 묻는다. 순서는 README의 권장 읽기 순서를 따르며, 10장은 10a와 10b로 나눈다.

## 사용 방법

- 장마다 4문제가 있다. 유형은 네 가지다.
  - **[예측]** 실행 결과·오류를 예측한다.
  - **[위치]** 근거가 되는 파일·함수를 찾는다.
  - **[교정]** 틀린 문장을 고친다.
  - **[설명]** 1분 안에 말로 설명한다.
- 예측 문제는 답을 먼저 적은 뒤 해설을 펼친다. 확인하고 싶으면 별도 파일로 저장해 `npm run run -- <파일>`로 실행할 수 있다. 오류 예제는 의도된 실패다.
- **통과 기준**: 4문제 중 3문제 이상을 해설과 같은 근거(함수·타입 이름)로 맞히면 다음 장으로 넘어간다. 2문제 이하라면 해당 장의 3·5절을 다시 읽는다.
- 모든 장을 통과하면 [Code Walkthrough](CODE_WALKTHROUGH.md)로 넘어간다.

| 순서 | 장 | 문제 |
|---|---|---|
| 1 | [00 전체 지도](#cp-00) | 4 |
| 2 | [01 Runner](#cp-01) | 4 |
| 3 | [02 Lexer](#cp-02) | 4 |
| 4 | [03 AST](#cp-03) | 4 |
| 5 | [04 Parser](#cp-04) | 4 |
| 6 | [10a 진단과 위치](#cp-10a) | 4 |
| 7 | [05 RuntimeValue](#cp-05) | 4 |
| 8 | [06 Environment](#cp-06) | 4 |
| 9 | [07 제어 흐름](#cp-07) | 4 |
| 10 | [08 함수와 클로저](#cp-08) | 4 |
| 11 | [10b 자원 제한](#cp-10b) | 4 |
| 12 | [09 배열과 대입](#cp-09) | 4 |
| 13 | [11 REPL / CLI](#cp-11) | 4 |
| 14 | [15 전체 추적](#cp-15) | 4 |
| 15 | [14 설계 Trade-off](#cp-14) | 4 |
| 16 | [12 검증](#cp-12) | 4 |
| 17 | [13 Benchmark](#cp-13) | 4 |
| | **합계** | **68** |

---

<a id="cp-00"></a>

## 00 프로젝트 전체 지도 · [교재](00-project-map.md)

1. **[위치]** `len("abc")`가 3을 반환하는 코드는 어느 파일의 어떤 함수 안에 있는가?
2. **[교정]** "Environment는 parser 다음에 실행되는 변환 단계로, AST를 값으로 바꾼다."
3. **[위치]** CLI 없이 테스트에서 print 결과를 문자열로 모으려면 어느 함수에 무엇을 넘기는가?
4. **[설명]** 문법 오류와 undefined variable 오류가 서로 다른 단계에서 발견되는 이유를 말하라.

<details>
<summary>해설</summary>

1. `builtins.ts`의 `createBuiltins`가 만드는 `len` builtin의 `invoke`. 문자열은 `value.value.length`(UTF-16 길이)다.
2. Environment는 변환 단계가 아니라 실행 내내 Interpreter가 참조하는 이름→cell 상태다. AST를 실행하는 것은 Interpreter다.
3. `runner.ts`의 `createSession(output)` 또는 `runScript(text, name, output)`에 문자열을 누적하는 함수를 넘긴다.
4. 문법 오류는 `parse`가 토큰 구조만 보고 판단한다. 이름이 존재하는지는 실행 중 `Environment.lookup`이 알 수 있다. parser는 runtime 값을 모른다.
</details>

<a id="cp-01"></a>

## 01 Runner와 실행 Pipeline · [교재](01-runner-pipeline.md)

1. **[예측]** 다음 프로그램의 stdout은? (파일 실행)

   ```mini-lang
   print("start");
   let x = ;
   ```

2. **[교정]** "`runScript`는 파일 경로를 받아 파일을 읽고 출력 문자열을 반환한다."
3. **[예측]** 같은 `Session`에 `runSource`로 `let a=1;`을 두 번 실행하면 두 번째는 어떻게 되는가?
4. **[설명]** `createSession`이 builtin 환경과 global을 따로 만드는 이유를 말하라.

<details>
<summary>해설</summary>

1. 출력 없음. compile 단계에서 `E_EXPECTED` SyntaxError가 나므로 execute가 시작되지 않는다.
2. `runScript(text, name, output)`는 이미 읽은 **문자열**을 받고 반환값은 `void`다. 파일 읽기는 `cli/run.ts`의 `main`이, 출력은 callback이 담당한다.
3. 두 번째 실행의 `prepare` 첫 순회가 기존 own 이름 a와의 충돌을 발견해 RuntimeError `E_REDECLARE`를 던진다.
4. builtin을 readonly 부모 cell로 두면 사용자가 `let print=1;`로 shadowing할 수는 있다. 하지만 선언 없이 `print=1;`로 덮어쓰면 `E_READONLY`가 된다. SPEC C의 builtin binding 행이다.
</details>

<a id="cp-02"></a>

## 02 SourceUnit / Token / Lexer · [교재](02-source-token-lexer.md)

1. **[예측]** `a<=b` 와 `a< =b`는 각각 토큰 몇 개인가? (EOF 제외)
2. **[예측]** 원문 `"x\ty"` (따옴표 포함 6글자)의 lexeme 길이와 literal 길이는?
3. **[위치]** CR 단독 줄바꿈을 한 줄로 세는 코드는 어디에 있는가?
4. **[예측]** 다음의 오류 code와 column은?

   ```mini-lang
   let n = 3.;
   ```

<details>
<summary>해설</summary>

1. `a<=b`는 3개(identifier, `<=`, identifier)이다. `a< =b`는 4개(`<`, `=`가 분리)이고, parser에서 `=`를 expression으로 읽을 수 없어 `E_EXPECTED`가 된다.
2. lexeme는 원문 그대로 6, literal은 `x`, 탭, `y`로 3이다.
3. `source-location.ts`의 `SourceUnit` constructor. `\r` 뒤가 `\n`이 아니어도 줄 시작을 추가한다.
4. 숫자 `3`을 읽은 뒤 `.` 다음이 숫자가 아니므로 `.`는 별도 문자가 되고 `E_CHARACTER`가 난다. 위치는 `.`의 column 10이다.
</details>

<a id="cp-03"></a>

## 03 AST · [교재](03-ast.md)

1. **[예측]** `print(-x);`의 Program height는? (Identifier/Literal은 1)
2. **[교정]** "Mini-Lang AST는 괄호를 제거하므로 `(a)`와 `a`는 같은 노드가 된다."
3. **[위치]** 새 Expr kind를 추가하고 `evaluate`에서 처리를 빠뜨리면 무엇이 오류를 내는가?
4. **[설명]** `span`과 `anchor`가 둘 다 필요한 이유를 Binary 노드로 설명하라.

<details>
<summary>해설</summary>

1. Identifier(1) → Unary(2) → Call(3, callee Identifier 1보다 큼) → Expression(4) → Program(5). 답은 **5**다.
2. `Group` 노드를 보존한다. 그래서 `(a)=1`은 대입 대상 Group으로 거절된다.
3. switch `default`의 `unreachable(expr)` 호출이 `never` 타입 불일치로 `tsc` 오류를 낸다(`errors.ts`의 `unreachable`). 테스트가 아니라 typecheck/build가 잡는다.
4. `span`은 전체 식 범위(왼쪽 끝~오른쪽 끝)이고, `anchor`는 진단 기준점인 연산자다. `1 + "a"` 오류는 식 시작이 아니라 `+`를 가리켜야 한다.
</details>

<a id="cp-04"></a>

## 04 Recursive Descent Parser · [교재](04-parser.md)

1. **[예측]** 출력은?

   ```mini-lang
   print(2 * 3 + 4 * 5, 20 / 2 / 5, !true == false);
   ```

2. **[예측]** `a = b + 1 = 2;`는 어디서 어떤 오류인가?
3. **[위치]** 함수 밖 return을 거절하는 상태 변수와 그것이 증감하는 위치는?
4. **[설명]** `f(1)[0](2)`의 AST 모양과 그것을 만드는 반복문을 설명하라.

<details>
<summary>해설</summary>

1. `26 2 true`. `20/2/5`는 왼쪽 결합이라 `(20/2)/5`이다. `!true == false`는 unary가 equality보다 높으므로 `(!true)==false`, 즉 `false==false`다.
2. `assignment`가 `a`를 읽고 `=`를 만나 RHS를 재귀 호출한다. RHS 쪽에서 `b + 1`을 읽은 뒤 `=`를 만나는데, 대상이 Binary라서 그 두 번째 `=`에서 `E_ASSIGN_TARGET`이 난다.
3. `Parser.functionDepth`. `declaration`의 fn 분기가 `block(params)` 전후로 증가·감소한다(finally 포함). `statement`의 return 분기가 0이면 `E_RETURN_CONTEXT`를 낸다.
4. `Call(Index(Call(f,[1]),0),[2])`. `postfix`가 `primary`를 한 번 읽은 뒤 `(` 또는 `[`가 이어지는 동안 기존 식을 Call/Index로 계속 감싼다.
</details>

<a id="cp-10a"></a>

## 10a 진단과 위치 · [교재](10-errors-limits.md#diagnostics)

1. **[예측]** 다음 오류의 code와 line:column은? (표시 이름 `t.lang`)

   ```mini-lang
   let xs = [1, 2];
   print(xs[1 + 1]);
   ```

2. **[예측]** `let s = "ab"; s[0];`의 오류 code와 진단이 가리키는 문자는?
3. **[교정]** "함수 안에서 `1 + "x"` 오류가 나면 진단은 그 함수를 호출한 줄을 가리킨다."
4. **[위치]** 진단 출력 형식(`kind at name:line:col: message` + 원문 줄 + caret)을 만드는 함수는?

<details>
<summary>해설</summary>

1. `E_INDEX_RANGE` at `2:10`이다. index 식 `1 + 1`의 시작 `1`을 가리키며 `[`가 아니다. 메시지는 `array index 2 out of bounds for length 2`다.
2. `E_INDEX_BASE`(TypeError)이고 `[`를 가리킨다. 문자열 index는 지원하지 않는다.
3. 함수 정의 원문의 `+`를 가리킨다. AST span이 정의한 SourceUnit을 참조하기 때문이다. 호출 쪽 `(`를 가리키는 것은 arity나 non-callable처럼 호출 자체의 오류다.
4. `errors.ts`의 `formatError`. tab을 공백 하나로 바꾸고 `column-1`개의 공백 뒤에 `^`를 붙인다.
</details>

<a id="cp-05"></a>

## 05 RuntimeValue와 연산 의미론 · [교재](05-runtime-values.md)

1. **[예측]** 출력은?

   ```mini-lang
   print([] && "ok", null == false, 7 % -3, "a" + "1");
   ```

2. **[예측]** `print(1 + true);`의 오류 kind/code는?
3. **[위치]** `-0`을 출력할 때 `0`으로 표시하는 근거는 어디에 있는가?
4. **[설명]** `print`가 반환하는 값과 그 값이 REPL에서 중요한 이유를 말하라.

<details>
<summary>해설</summary>

1. `ok false 1 a1`. `[]`는 truthy라 오른쪽을 반환한다. `null==false`는 tag가 달라 false다. `7 % -3`은 truncate remainder라 1이다. string+string은 연결이다.
2. TypeError `E_OPERAND`: `operator '+' cannot be applied to number and boolean`.
3. `value-format.ts`의 `display`가 `String(item.value)`를 쓰고, JS의 `String(-0)`은 `"0"`이다. equality는 `===`라서 `0==-0`도 true다.
4. `NULL`을 반환한다. REPL echo는 null을 출력하지 않으므로 `print(3);`이 3과 null을 중복 출력하지 않는다.
</details>

<a id="cp-06"></a>

## 06 Environment / Lexical Scope / TDZ / Hoisting · [교재](06-environment-scope.md)

1. **[예측]** 출력 또는 오류는?

   ```mini-lang
   let x = "g";
   fn show() { return x; }
   { let x = "b"; print(show()); }
   ```

2. **[예측]** `{ f(); let v = 1; fn f() { print(v); } }`의 결과는?
3. **[위치]** TDZ cell을 만나면 부모로 넘어가지 않는 코드 두 줄을 찾아라.
4. **[설명]** `prepare`의 첫 순회(충돌 선검사)가 일반 블록에서는 사실상 항상 통과하는 이유와, 그래도 필요한 상황을 말하라.

<details>
<summary>해설</summary>

1. `g`. show의 closure는 global이므로 블록의 x가 아니라 global x를 읽는다.
2. `E_TDZ`. f는 블록에 진입할 때 초기화되어 호출할 수 있지만, f가 읽는 v는 아직 uninitialized다.
3. `environment.ts`의 `lookup`이 `if (cell) return cell;`로 가장 가까운 cell에서 멈춘다. `reference`가 `cell.state.kind === 'uninitialized'`이면 `E_TDZ`를 던진다.
4. 일반 블록은 매번 새 빈 Environment라 기존 own 이름이 없다. 첫 순회는 persistent global에서 이전 REPL submission이 만든 이름과 충돌할 때 필요하다. 그때 새 이름을 하나도 예약하지 않고 중단한다.
</details>

<a id="cp-07"></a>

## 07 Interpreter / Evaluation / Control Flow · [교재](07-interpreter-control-flow.md)

1. **[예측]** 출력은?

   ```mini-lang
   fn first(xs) {
     let i = 0;
     while (i < len(xs)) {
       if (xs[i] > 10) { return xs[i]; }
       i = i + 1;
     }
   }
   print(first([3, 12, 40]), first([1]));
   ```

2. **[예측]** `fn f(){ fn g(){ return 1; } g(); return 2; } print(f());`의 출력은?
3. **[위치]** `While`이 body의 return을 보고 즉시 빠져나오는 조건문은 어디 있는가?
4. **[설명]** 실행되지 않는 else 분기에 `missing;`이 있어도 오류가 없지만, `missing` 대신 `1 +;`이 있으면 오류인 이유는?

<details>
<summary>해설</summary>

1. `12 null`. 두 번째 호출은 return 없이 body가 끝나 `NULL`이다.
2. `2`. g의 return은 안쪽 Call에서 소비된다.
3. `interpreter.ts`의 `statement`, While 분기의 `if (result.kind === 'return') return result;`.
4. `missing`은 실행 시점의 이름 조회 오류라 평가하지 않으면 발생하지 않는다. `1 +;`은 구문 오류라 전체 parse 단계에서 프로그램 실행 전에 거절된다.
</details>

<a id="cp-08"></a>

## 08 Function / Recursion / Closure · [교재](08-functions-closures.md)

1. **[예측]** 출력은?

   ```mini-lang
   fn pair() {
     let n = 0;
     fn inc() { n = n + 1; return n; }
     fn get() { return n; }
     return [inc, get];
   }
   let p = pair();
   let q = pair();
   p[0](); p[0](); q[0]();
   print(p[1](), q[1]());
   ```

2. **[예측]** `fn f(a,b){} f(print(1));`의 출력과 오류는?
3. **[위치]** builtin 호출이 callDepth를 증가시키지 않는다는 근거가 되는 코드 위치는?
4. **[설명]** `fib(5)`를 실행할 때 전체 호출 수와 최대 활성 호출 수가 다른 이유를 말하라.

<details>
<summary>해설</summary>

1. `2 1`. 같은 pair 호출에서 만든 inc/get은 cell을 공유하고, p와 q는 서로 독립이다.
2. 출력 없음, `E_ARITY`(`function 'f' expects 2 arguments but got 1`). arity 검사가 인수 평가보다 먼저다.
3. `interpreter.ts` Call 분기에서 `if (callee.tag === 'builtin') return callee.invoke(...)`가 callDepth 검사·증가보다 **앞**에 있다.
4. 두 갈래 재귀는 많은 호출을 만들지만, 동시에 활성인 것은 루트에서 현재 호출까지의 한 경로뿐이다. callDepth는 이 경로 길이를 센다.
</details>

<a id="cp-10b"></a>

## 10b 자원 제한 · [교재](10-errors-limits.md#resource-limits)

1. **[예측]** `fn f(n){ if(n==0){return 0;} return f(n-1); }`에서 `f(63)`과 `f(64)`의 결과는?
2. **[예측]** `'!'.repeat(64) + 'true;'`와 `'!'.repeat(65) + 'true;'`는 각각 파싱되는가?
3. **[교정]** "호스트 스택이 넘치면 언제나 RuntimeError E_HOST_LIMIT가 된다."
4. **[설명]** 오류가 난 뒤 같은 REPL에서 다음 재귀가 정상 동작하는 이유를 카운터 관점에서 말하라.

<details>
<summary>해설</summary>

1. `f(63)`은 활성 호출이 64개(63..0)라 성공한다. `f(64)`는 65번째 진입이라 `E_CALL_DEPTH`가 난다(T-SAFE-1).
2. 64개는 파싱되고 65개는 `E_INPUT_LIMIT` "syntax nesting limit (64) exceeded"다. unary operand 재귀가 edge 하나씩이다(BRC-02).
3. 단계에 따라 다르다. lexer와 parser의 `RangeError`는 SyntaxError `E_INPUT_LIMIT`(cause 없음)가 된다. 실행 중에는 가장 안쪽 guard가 RuntimeError `E_HOST_LIMIT`(cause 보존)로 바꾼다. RangeError가 아닌 host Error는 변환하지 않는다.
4. callDepth와 evaluationDepth는 진입에 성공했을 때만 증가하고 `try/finally`로 항상 감소한다. Session의 같은 Interpreter가 오류 뒤에도 0에서 다시 시작한다(T-SAFE-4).
</details>

<a id="cp-09"></a>

## 09 Array / Reference / Assignment Evaluation Order · [교재](09-arrays-assignment.md)

1. **[예측]** 출력은?

   ```mini-lang
   fn fill(xs, v) { xs[0] = v; xs = [v, v]; return xs; }
   let a = [0, 0];
   let b = fill(a, 5);
   print(a, b, a == b);
   ```

2. **[예측]** `let a=[1,2]; let i=0; a[i] = (i = 1); print(a, i);`의 출력은?
3. **[위치]** Index 대상에서 RHS보다 먼저 범위를 검사하는 함수는?
4. **[설명]** `let row=[0]; let m=[row,row]; m[0][0]=9;` 뒤 `print(m)`의 결과와 그것이 cycle이 아닌 이유는?

<details>
<summary>해설</summary>

1. `[5, 0] [5, 5] false`. `xs[0]=v`는 호출자의 배열을 mutation하지만, `xs=[v,v]`는 매개변수만 재바인딩한다.
2. `[1, 2] 1`. 대상 `(a, 0)`이 RHS보다 먼저 확정되므로 0번에 1이 들어간다.
3. `interpreter.ts`의 `indexReference`. Assign 분기는 이것을 호출한 **뒤에** RHS를 평가한다.
4. `[[9], [9]]`. 같은 row 객체를 두 위치에서 공유한다. formatter는 현재 경로에 있는 배열만 cycle로 보므로, 형제 위치의 반복은 정상으로 표시한다.
</details>

<a id="cp-11"></a>

## 11 REPL / Persistent Session / CLI · [교재](11-repl-cli.md)

1. **[예측]** 아래를 한 줄씩 입력하면 각 줄 뒤에 무엇이 출력되는가?

   ```text
   let s = "hi"
   ;
   s
   [s]
   ```

2. **[예측]** `let x=1;`을 제출한 뒤 `print(5); let x=2;`를 제출하면 5가 출력되는가?
3. **[위치]** 미완성 입력 상태에서 EOF가 오면 exit 1이 되는 코드는?
4. **[설명]** `print("{");`가 다음 줄을 기다리지 않는 이유를 말하라.

<details>
<summary>해설</summary>

1. 1행은 `let`에 `;`가 없어 incomplete다(continuation prompt). 2행 `;`로 complete가 되어 실행되지만 선언이라 echo가 없다. 3행은 `hi`(최상위 문자열은 따옴표 없음), 4행은 `["hi"]`다.
2. 출력되지 않는다. `prepare` 첫 순회가 기존 global x와의 충돌을 실행 전에 발견해 `E_REDECLARE`로 전체 submission을 중단한다(ADV-07).
3. `repl.ts`의 `endInput`이 남은 버퍼를 다시 `classify`하고 complete가 아니면 진단을 출력한 뒤 1을 반환한다. `cli/repl.ts`의 close 핸들러가 그 값을 exitCode로 쓴다.
4. 판정은 괄호 개수가 아니라 실제 parse 결과로 한다. 문자열 안의 `{`는 토큰이 아니다.
</details>

<a id="cp-15"></a>

## 15 전체 프로그램 실행 추적 · [교재](15-end-to-end-trace.md)

1. **[예측]** 15장 예제의 `let first=step(2);`를 `let first=step(2)[0];`으로 바꾸면 마지막 출력은?
2. **[위치]** 15장 C단계(전역 준비)에서 make만 즉시 초기화되는 코드 위치는?
3. **[교정]** "next가 global에서 호출되므로 box는 global에서 찾는다."
4. **[설명]** 15장 예제를 실행하는 동안 생성되는 Environment 객체를 모두 나열하라.

<details>
<summary>해설</summary>

1. `3 [6] false`. first는 그 시점의 숫자 3(primitive)을 저장한다. second는 배열 A이고, 숫자와 배열은 tag가 달라 같지 않다.
2. `interpreter.ts`의 `prepare` 세 번째 for 루프(`stmt.kind === 'Function'`만 `env.initialize`).
3. next의 closure는 make 호출 frame F다. 호출 frame C의 parent가 F이므로 box는 F에서 찾는다. 호출 위치는 이름 검색 경로가 아니다.
4. builtin 환경 B, global G, `make(1)`의 frame F, `step(2)`의 frame C1, `step(3)`의 frame C2. print 같은 builtin 호출은 frame을 만들지 않는다.
</details>

<a id="cp-14"></a>

## 14 주요 설계 Trade-off와 대안 · [교재](14-design-tradeoffs.md)

1. **[교정]** "resolver로 lexical depth를 미리 계산하면 동작은 같고 무조건 빨라지므로 단순 개선이다."
2. **[설명]** Completion record 방식의 비용과 얻은 것을 한 문장씩 말하라.
3. **[위치]** runtime-values와 environment 사이의 순환 import를 피한 방법은?
4. **[설명]** 깊이 guard의 "비용"은 무엇인가?

<details>
<summary>해설</summary>

1. resolver는 추가 pass와 persistent global(REPL late binding) 처리가 필요하다. 성능 효과도 측정되지 않았다. 대안은 비용과 함께 비교해야 한다.
2. 비용은 모든 제어 경계가 completion을 전달하는 코드다. 얻은 것은 정상 return과 오류 throw의 분리, 그리고 타입에 드러나는 제어 흐름이다.
3. `runtime-values.ts`가 `import type { Environment }`만 쓴다. 타입 참조는 실행 시 모듈 초기화 의존을 만들지 않는다(ARCHITECTURE D).
4. 문법적으로 유효하고 종료하는 프로그램도 너무 깊으면 거절된다(예: callDepth 65 이상이 필요한 재귀).
</details>

<a id="cp-12"></a>

## 12 Testing / Regression / Fuzz / Adversarial Review · [교재](12-testing-review.md)

1. **[교정]** "fuzz가 18,432건을 실패 없이 통과했으므로 Mini-Lang의 모든 출력은 정확하다."
2. **[위치]** 예제 출력 비교에서 CRLF만 정규화하고 trim하지 않는 함수는?
3. **[설명]** `missing = print(1);` 테스트가 "오류가 난다"만 검사하면 놓치는 버그는?
4. **[예측]** 무한 loop가 있는 Mini-Lang 프로그램을 fuzz의 임의 입력 lane이 생성하면 checkCase는 그것을 실행하는가?

<details>
<summary>해설</summary>

1. fuzz는 구조 invariant(EOF, span, AST height, 오류 계열, 카운터 복구)를 검사할 뿐 정답 출력 oracle이 아니다. 사례 수도 당시의 seed/index 수다.
2. `tests/helpers/examples.ts`의 `verifyOutput`.
3. RHS를 먼저 평가해 1을 출력한 뒤 오류를 내는 구현. 출력이 비어 있는지도 단언해야 한다(BRC-06).
4. 실행하지 않는다. 임의 입력의 AST에 While이 있으면 parse와 classify만 검사한다. grammar lane의 while만 보호된 counter가 있어 실행한다.
</details>

<a id="cp-13"></a>

## 13 Benchmark와 성능 · [교재](13-benchmark.md)

1. **[교정]** "compile median과 execute median을 더하면 pipeline median이 된다."
2. **[위치]** 입력 준비가 타이머 밖에 있다는 근거가 되는 파일과 코드 순서는?
3. **[설명]** benchmark가 결과 값을 매번 검증하는 이유는?
4. **[교정]** "benchmark 결과의 Node24/Node20 비율은 Node24가 모든 workload에서 더 빠르다는 증거다."

<details>
<summary>해설</summary>

1. 각 phase를 별도 process에서 측정하므로 JIT, GC, 할당 상태가 달라 더할 수 없다.
2. `benchmarks/worker.ts`. `task.prepare()`로 operations를 만든 뒤 `performance.now()` 시작, 실행, 종료 순서이고, 결과 assert는 그 뒤에 있다.
3. 잘못된 결과를 빠르게 내는 실행은 의미가 없다. 측정 대상이 실제로 같은 일을 했는지 확인하기 위해서다.
4. 특정 머신, 시점, 설정에서의 관찰값일 뿐 일반적 우열이나 통계적 유의성을 뜻하지 않는다. 일부 workload는 Node20이 더 빠르다(BENCHMARK.md).
</details>
