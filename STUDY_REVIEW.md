# Study Material Review

검토 대상은 `docs/study/` 17개 파일(README, 00~15)이다. 기술 감수자, 교육자, 면접관의 관점에서 다음 자료와 대조했다.

- 소스: `src/` 전체
- 테스트: `tests/`, `examples/`
- 명세: `SPEC.md`, `GRAMMAR.md`, `ARCHITECTURE.md`

기준 저장소는 HEAD `5c248fe`이고, 교재 README에 적힌 기준 커밋과 같다. 코드와 교재는 수정하지 않았다.

## 0. 검토 방법과 총평

- **장별 대조**: 각 장의 3절(구현)과 4절(파일·함수·타입)을 실제 함수 본문과 한 문장씩 맞춰 봤다.
- **예제 실행**: 교재의 `mini-lang` 코드 블록 17개를 현재 빌드로 전부 실행했다.
  - 정상 예제 13개는 출력이 교재와 정확히 일치했다.
  - 의도된 오류 예제 4개도 교재가 말한 오류 code와 부수 효과가 그대로 나왔다(`E_INDEX_RANGE`, `E_ZERO_DIVISION`, `E_UNDEFINED`, 출력 없음 등).
  - 10장 진단 출력은 `formatError` 결과와 문자 단위로 같았다.
- **확인 문제 검증**: 해설의 주장 중 실행으로 확인할 수 있는 것도 직접 돌렸다. 대상은 `f(print(1),print(2))`의 `E_ARITY`, `1[print(99)]`의 `E_INDEX_BASE`, 블록 TDZ, `missing=print(1)` 등이다.

**총평**: 사실 오류는 드물고, 일반 CS 개념과 Mini-Lang 구현을 구분하려는 구조(각 장 2절 대 3절)가 잘 지켜진다. 문제는 대부분 "틀렸다"가 아니라 다음 두 가지다.

1. 제어·환경 추적에서 표현이 조금 부정확해 잘못된 모델을 심을 수 있는 곳이 몇 군데 있다.
2. 면접에서 반드시 나올 경계와 대비가 빠져 있다. 예를 들어 오류별 anchor 규칙, `E_DUPLICATE`와 `E_REDECLARE`의 차이, 깊이 제한의 포함·불포함 경계, 파서 단계의 `RangeError` 변환이 없다.

---

## 1. 반드시 수정해야 하는 내용

### R1. 07장 5절 3~4단계: `i`가 블록 환경에 있는 것처럼 읽힌다

- **교재**: "첫 반복의 새 block에서 i를 1로 바꾼다", "두 번째 반복의 새 block에서 i는 2가 된다"
- **실제 동작**:
  - `i`는 `let i=0;`으로 함수 본문 최상위에 선언되어 있다. 그래서 `Interpreter.prepare(callee.declaration.body.statements, frame)`가 **호출 frame**에 예약한다(`interpreter.ts` evaluate의 `Call` 분기).
  - while 본문 블록은 `statement`의 `Block` 분기에서 매 반복 `new Environment(env)`로 새로 만들어지지만, 이 블록에는 직접 선언이 없어서 비어 있다.
  - `i=i+1`은 `env.reference('i', …, true)`로 parent를 따라가 frame의 cell을 갱신한다.
- **위험**: 학습자가 "매 반복 새 블록 = 반복 변수가 매번 새로 생긴다"고 오해한다. 이는 06장 표와 T-CLOS-2(블록 안 `let`만 반복마다 새 cell)의 핵심 구분을 흐린다. 13장 5절은 같은 상황을 "block 환경은 매번 새로 생기지만 i/sum은 부모의 cell을 갱신한다"고 정확히 쓴다.
- **수정안**: "첫 반복에서 빈 block 환경이 새로 생기고, `i=i+1`은 parent인 호출 frame의 `i` cell을 1로 바꾼다."

### R2. 07장 5절 6단계: return 전파 순서가 실제 호출 경계와 다르다

- **교재**: "if → body list/block → while → 함수 body list 순서로 같은 반환 상태가 전파된다."
- **실제 순서**는 `interpreter.ts`의 `statement`와 `list`, 그리고 `Call` 분기에서 다음과 같다.
  1. `Return` 문장이 `{kind:'return', value}`를 만든다.
  2. if의 then `Block`의 `list`가 즉시 반환한다.
  3. `Block` 문장이 그 결과를 그대로 반환한다.
  4. `If` 문장이 선택한 분기의 completion을 그대로 반환한다.
  5. while 본문 `Block`의 `list`가 반환하고, `Block` 문장이 반환한다.
  6. `While`이 `result.kind === 'return'`이면 반환한다.
  7. 함수 body의 `list`가 반환한다.
  8. `Call`이 `result.kind === 'return' ? result.value : NULL`로 소비한다.
- **위험**: "return propagation"은 면접 단골 주제다. 교재 문장은 If가 Block보다 먼저 결과를 받는 것처럼 읽힌다.
- **수정안**: 위 순서를 표나 화살표로 쓰고, 각 단계의 함수(`list`, `statement`의 Block/If/While 분기, `evaluate`의 Call 분기)를 붙인다.

### R3. 10장 4절: `RangeError` 변환을 실행 단계만으로 설명한다

- **교재**: "RangeError는 실행 경계에서 cause를 가진 E_HOST_LIMIT로 바꾸지만…"
- **실제 동작**: 변환 지점은 세 곳이고 결과가 서로 다르다.

| 위치 | 근거 | 결과 |
|---|---|---|
| Lexer | `lexer.ts` `lex`의 `catch (error) { if (error instanceof RangeError) … }` | **SyntaxError** `E_INPUT_LIMIT` "host syntax limit exceeded" (cause 없음, 현재 lexer offset) |
| Parser | `parser.ts` `Parser.program`의 catch | **SyntaxError** `E_INPUT_LIMIT` "host syntax limit exceeded" (cause 없음, 현재 token) |
| Interpreter | `interpreter.ts` `guard`의 catch와 `execute`의 catch에서 호출하는 `rethrowRuntime` | **RuntimeError** `E_HOST_LIMIT` (`{ cause }` 보존) |

- **추가로 정정할 점**: 실행 단계의 변환은 "경계 한 곳"이 아니라 **모든 evaluate/statement guard의 catch**에서 일어난다. 그래서 가장 안쪽 guard의 anchor가 붙는다. `execute`의 catch는 guard 밖(예: `prepare`)에서 생긴 `RangeError`를 위한 마지막 방어선이다(`functions.test.ts` T-SAFE-2의 `FailingEnvironment` 사례).
- **위험**: 10장 3절 표에서 `E_INPUT_LIMIT`는 nesting과 height에만 연결되어 있다. 학습자는 "호스트 스택 초과 = 항상 RuntimeError"라고 답하게 된다.

### R4. README와 11장: REPL Ctrl+C 동작의 전제 조건이 빠져 있다

- **교재 (11장 6절)**: "Ctrl+C의 cancelInput은 pending 입력 취소…"
- **실제 동작**: `cli/repl.ts`는 `terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY)`일 때만 readline이 `'SIGINT'` 이벤트를 낸다. stdin이 TTY라도 stdout을 파일로 돌리는 등 terminal 모드가 아니면, Ctrl+C는 `cancelInput`이 아니라 프로세스 종료다.
- **수정안**: 7절의 "Prompt는 stdin과 stdout이 모두 TTY일 때만 표시" 바로 옆에 "Ctrl+C 취소도 같은 조건"을 덧붙인다.

> 위 네 개 외에 **코드와 정면으로 모순되는 설명은 찾지 못했다.** 함수 이름, 타입 필드, 오류 code, 예제 출력, AST height 계산(03장 1→2→3→4→5→6), formatter 출력, benchmark의 타이머 구간(`benchmarks/worker.ts`)은 모두 실제와 일치한다.

---

## 2. 있으면 좋은 보완 내용

### 정밀도 보완 (면접 대비 우선순위 높음)

**S1. 10장 3절 표: 제한값에 포함·불포함 경계를 적는다.** 구현은 모두 "진입 전 `>=` 검사 후 증가"다.

| 제한 | 근거 | 허용 | 거절 |
|---|---|---|---|
| parser nesting | `Parser.nested`의 `this.nesting >= 64` | 64개 edge | 65번째 |
| AST height | `Parser.node`의 `height > 128` | 128 | 129 |
| evaluation | `guard`의 `this.evaluationDepth >= 256` | 256개 활성 | 257번째 |
| call depth | Call 분기의 `this.callDepth >= 64` | 64개 활성 | 65번째 |
| formatter | `display`의 `depth >= 64` | 64층 | 65번째 배열이 `<max-depth>` |

"edge"를 세는 방식도 예로 보여 준다. 괄호 `(1)`은 1 edge다. 반면 `[[]]`처럼 가장 안쪽이 빈 배열은 자식 식이 없어서 바깥 배열이 edge를 하나도 만들지 않는다. 배열은 bracket이 아니라 원소 식 진입을 센다(`Parser.list`의 `nested(() => this.expression())`). 경계 테스트는 `blind-review.test.ts`의 BRC-02에 있다.

**S2. 10장: 오류별 anchor 규칙 표를 추가한다.** SPEC G1 표와 실제 코드를 대조했다.

| 오류 | anchor | 코드 근거 |
|---|---|---|
| 이름 조회(`E_UNDEFINED`/`E_TDZ`), 대입 대상의 undefined·readonly | 이름 첫 글자 | `env.get(expr.name, expr.span)`, `reference(…, expr.target.span, …)` |
| `E_ASSIGN_TARGET` | `=` | `Parser.assignment` |
| 연산자 오류 | 연산자 | Binary/Logical/Unary의 `anchor` |
| non-callable·arity·call depth·builtin 타입 오류 | 호출의 `(` | Call의 `anchor` |
| non-array(`E_INDEX_BASE`) | `[` | `indexReference`, `Index.anchor` |
| index 타입·범위 | index **식의 시작** | `expr.index.span` |
| `E_DUPLICATE` | 두 번째 이름 | `registerName` |
| `E_RETURN_CONTEXT` | `return` | |
| lexer 오류 | 문제 문자 / backslash / raw newline / 여는 따옴표 / 첫 suffix 문자 | `lex` |

면접에서는 "왜 index 범위 오류는 `[`가 아니라 index 식을 가리키나"가 좋은 꼬리 질문이다.

**S3. `E_DUPLICATE`와 `E_REDECLARE`를 대비해서 설명한다.** 현재 교재에는 두 code가 전혀 등장하지 않는다.
- `E_DUPLICATE`: **SyntaxError**. 같은 소스 안의 중복을 parser가 이름을 읽는 즉시 거절한다(`Parser.registerName`).
- `E_REDECLARE`: **RuntimeError**. REPL의 기존 global과 새 선언이 충돌할 때 `Interpreter.prepare`의 첫 순회가 실행 전에 거절한다.
- 왜 하나는 정적이고 하나는 동적인지가 persistent session 설계의 핵심이다. 06장 7절과 11장에 함께 넣는다.

**S4. 04장: 대입 파싱의 실제 전략을 설명한다.**
- `Parser.assignment`는 `const target = this.or()`로 왼쪽을 **일반 식으로 먼저 파싱한 뒤** `=`를 만나면 kind를 검사한다.
- 그래서 `1+2 =`는 RHS를 기다리지 않고 `=` 위치에서 즉시 invalid가 된다. REPL에서 incomplete로 분류되지 않는 이유가 이것이다.
- GRAMMAR의 `assignment = logicalOr, [ "=", assignment ]`는 문법 자체로는 LHS를 제한하지 않는다. 제한은 "정적 제약"으로 따로 정의되어 있다.
- 이것은 lookahead만으로 갈래를 고르는 순수 LL(1) 설명과 다르다. JavaScript 파서의 "cover grammar"와 비슷한 기법이라고 연결해 두면 면접 답변이 강해진다.

**S5. 04장과 11장: 중복을 "즉시" 검사하는 이유를 설명한다.**
- `registerName`은 선언 이름 토큰을 읽자마자 호출된다.
- 그래서 `let x=1;let x=`가 끝까지 파싱되지 않아도 invalid로 판정된다(`regression.test.ts`의 duplicate prefix 테스트).
- 매개변수는 별도 Set으로 검사한 뒤 `block(params)`가 본문 scope Set의 초기값으로 넣는다. 그래서 매개변수와 본문 최상위 선언이 충돌하면 거절된다. 함수 이름은 바깥 scope에 등록되므로 매개변수가 함수 이름을 가릴 수 있다.

**S6. 08장: 호출 순서에서 따라 나오는 관찰 가능한 결과를 명시한다.** 순서는 이미 정확히 적혀 있다. 그 결과로 다음 두 가지가 생긴다.
- call depth 검사는 **인수 평가 후**에 일어난다. 그래서 65번째 호출이 거절되어도 인수의 부수 효과는 이미 일어났다(`adversarial.test.ts` ADV-06).
- 반면 arity 오류는 인수를 평가하지 않는다(T-CALL-2).

같은 "호출 실패"라도 부수 효과가 다르다는 점이 면접에서 변별력이 크다.

**S7. 11장: persistent global의 late binding 사례를 추가한다.**
- `fn f(){return future;}`를 먼저 제출하고 다음 submission에서 `let future=3;`을 실행하면 `f()`는 3을 반환한다. 그 사이에 호출하면 `E_UNDEFINED`다(SPEC F1, `regression.test.ts` T-REPL-7).
- 06장 6절의 "모든 중첩 블록 이름을 미리 예약하지 않는다"와 대비시키면, "global만 늦게 이름이 생길 수 있는 이유"가 분명해진다.

**S8. 11장: REPL의 submission 단위 원자성을 설명한다.**
- 충돌 preflight는 출력, 함수 초기화, 새 이름 예약보다 **먼저** 일어난다(`prepare`의 첫 for 루프, ADV-07).
- 반면 runtime 오류는 앞선 효과를 남긴다.

"구문 오류 = 무실행, 충돌 = 무실행, runtime 오류 = 부분 효과 유지"의 세 경우를 표로 정리한다.

**S9. 05장: 0 나눗셈과 비유한 결과를 구분한다.**
- `1/0`과 `0/0`은 `E_ZERO_DIVISION`이다(`binary`에서 `b === 0`을 먼저 검사).
- `1e308*10` 같은 overflow는 `E_NONFINITE`다. 둘 다 RuntimeError지만 code가 다르다.
- 현재 확인 문제 3은 "RuntimeError 대 SyntaxError"만 다룬다.

**S10. 02장: lexer 오류 code와 위치 규칙을 표로 정리한다.** 현재는 확인 문제에서 `E_NUMBER` 하나만 등장한다.

| 오류 | code | 위치 |
|---|---|---|
| 불법 문자 | `E_CHARACTER` | 문제 문자 |
| 숫자 suffix | `E_NUMBER` | 첫 suffix 문자 |
| 비유한 숫자 literal | `E_NUMBER` | 숫자 시작 |
| 문자열 안 raw newline | `E_STRING` | 그 문자 |
| 닫히지 않은 문자열 | `E_STRING` | 여는 따옴표 |
| 잘못된 escape | `E_ESCAPE` | backslash |

함께 정리할 것:
- `1.`과 `.5`는 `'.'`가 `E_CHARACTER`가 되고, 선행 0은 허용된다.
- CR 단독도 줄바꿈이다(`SourceUnit` constructor).

### 개념 혼동 방지

**S11. 08장, 10장, 15장: Mini-Lang의 "frame"과 JS 호출 스택을 구분한다.**
- 교재의 "호출 frame"은 **heap에 있는 `Environment` 객체**다. 호출이 끝나도 closure가 참조하면 살아 있다.
- 깊이 guard가 보호하는 것은 **JavaScript 호출 스택**이다. 언어 호출 한 번이 JS frame 여러 개를 쓴다(evaluate → guard → 화살표 함수 → …).
- 15장 2절은 control stack과 lexical chain을 구분하지만, 08장과 10장은 이 연결을 말하지 않는다. "왜 callDepth 64와 evaluationDepth 256이 따로 필요한가"의 답이 여기서 나온다.

**S12. 07장 2절: "Completion record"의 범위를 좁혀 둔다.**
- ECMAScript의 completion에는 normal, return, throw, break, continue가 있다.
- Mini-Lang의 `Completion`은 `normal | return` 두 가지뿐이고, 오류는 completion이 아니라 `LangError` throw다.
- break/continue는 문법 자체에 없다(SPEC C의 unsupported 행).

**S13. 06장: JavaScript와 비교표를 추가한다.**
- `let`의 TDZ는 JS와 비슷하다.
- 함수 선언의 블록 단위 초기화는 Mini-Lang 고유 규칙이다(JS의 블록 함수 선언 의미는 별도 규칙이 있음).
- REPL에서 초기화에 실패한 global이 영구 TDZ로 남는 것도 Mini-Lang 고유다.

"JS를 흉내 냈다"가 아니라 "명세로 정한 규칙"이라는 점이 드러난다.

**S14. 05장: 타입 체계를 정확히 부른다.** Mini-Lang은 **동적 타입이면서 암묵 변환이 없는(strong) 타입**이다. 정적 타입 검사는 TypeScript 구현 쪽의 이야기다(14장 6절에서 일부 언급). 면접에서 "dynamically typed 대 weakly typed" 질문에 바로 답할 수 있게 된다.

### 면접 답변 보강

**S15. 복잡도 관점을 한 단락 추가한다.**

| 연산 | 비용 | 근거 |
|---|---|---|
| 이름 조회 | O(환경 체인 깊이) | `Environment.lookup` |
| 위치 변환 | O(log 줄 수) | `SourceUnit.position` 이진 탐색 |
| REPL 입력 판정 | 줄마다 버퍼 전체 재-lex/parse, 긴 pending 입력에서 O(n²) | `Repl.submitLine` → `classify` |
| scope 준비 | O(직접 선언 수) | `prepare` |

13장 benchmark의 prepopulated와 fixed 비교가 왜 global 수에 비례하지 않는지도 `Map` 조회로 설명할 수 있다.

**S16. 08장과 14장: 환경 전체 capture의 메모리 비용을 다룬다.**
- closure는 실제로 쓰는 변수만이 아니라 **선언 환경 전체**(그리고 parent chain)를 붙잡는다.
- upvalue 방식과의 차이는 "구현 복잡도" 외에 "보존되는 객체 범위"이기도 하다.

**S17. 11장 9절에 확인 문제를 추가한다.**
- `1+2 =`가 incomplete가 아닌 이유
- `let x=1;let x=`가 invalid인 이유
- 미완성 입력 상태로 EOF가 오면 exit 1인 이유(`Repl.endInput`이 다시 분류한 뒤 진단)

**S18. 12장: 교재 자체를 검증하는 방법을 추가한다.** 이번 검토처럼 교재의 `mini-lang` 블록을 실행해 바로 뒤의 `text` 블록과 비교할 수 있다. README의 예제는 `docs.test.ts`가 실행하지만 출력이 비어 있지 않은지만 본다. 교재 예제는 자동 검증 대상이 아니라는 사실을 적어 둔다.

---

## 3. 그대로 두어도 되는 내용

| 장 | 정확하고 교육적으로 잘 된 부분 |
|---|---|
| README | 장 구성(2절 일반 개념, 3절 구현, 7절 대안), 과거 보고서 수치를 현재 결과로 읽지 말라는 경고 |
| 00·01 | `runSource = execute(compile(source), session)`의 평가 순서 설명, Session 필드(`global`, `interpreter`)의 정확한 범위, export와 실행의 구분 |
| 02 | lexeme와 literal의 구분, 토큰 offset 표(실제와 일치), BOM column 예외, BR-01 수정 후 "진단은 code point, 위치는 UTF-16" 설명 |
| 03 | AST height 예시 계산, `readonly`가 런타임 동결이 아니라는 지적, Group 보존 이유, `unreachable(never)`의 역할 |
| 04 | precedence 사다리와 "binary 반복 = 왼쪽 결합, assignment 재귀 = 오른쪽 결합" 설명, `1<2<3`, `++x`, Parser scope Set과 Environment의 구분 |
| 05 | `truthy` 실제 코드 인용, `&&`/`||` 피연산자 반환, `%`의 truncate remainder, primitive payload 비교와 identity 비교 |
| 06 | `prepare` 세 순회와 그 이유(부분 예약 방지), TDZ cell이 parent 검색을 막는다는 점, 식별자 대입이 `assign`이 아니라 `reference`를 거친다는 정확한 지적 |
| 08 | `new Environment(callee.closure)` 한 줄을 근거로 한 lexical scope 설명, fact 재귀 표(활성 깊이 4, parent는 global), sibling 공유와 factory 독립 |
| 09 | `a[0]=(a=[9])` 시점별 표(실행 결과 `[[9]] [9] true`와 일치), `readonly elements`의 의미, cycle과 alias 구분 |
| 10 | `LangTypeError`가 `LangRuntimeError`의 하위가 아니라는 점, 진단 출력 예시(실제와 문자 단위로 일치), "finally는 카운터만 복구하고 효과는 롤백하지 않음" |
| 11 | complete/incomplete/invalid 분류, echo와 print의 경로 구분, 문법 오류 무실행과 runtime 오류 효과 유지 |
| 12 | 테스트 수·사례 수·버그 원인 수의 구분, BRC-06이 버그 수정이 아니라 테스트 공백 보강이라는 정확한 서술, fuzz의 oracle 한계 |
| 13 | 측정 구간 표(`benchmarks/worker.ts`의 `prepare`는 타이머 밖, assert는 타이머 뒤와 일치), median을 합산하지 말라는 경고 |
| 14 | 대안은 개선안이 아니라는 태도, operator가 `string`이라 생기는 exhaustiveness 공백 |
| 15 | 객체 이름 붙인 전체 추적(실행 결과 `[6] [6] true`와 일치), "Session에 SourceUnit 필드는 없다"는 정확한 서술 |

---

## 4. 누락된 핵심 개념

| # | 개념 | 왜 핵심인가 | 넣을 위치 | 코드 근거 |
|---|---|---|---|---|
| G1 | 오류별 anchor 규칙 | "source-aware errors"의 실체 | 10장 | 각 `throw`의 span 인수 (S2) |
| G2 | `E_DUPLICATE`(Syntax) 대 `E_REDECLARE`(Runtime) | 정적 검사와 persistent session의 경계 | 06·11장 | `registerName`, `prepare` (S3) |
| G3 | lexer와 parser의 `RangeError` → `E_INPUT_LIMIT` | depth guard 설명의 완결 | 10장 | `lex`, `Parser.program` catch (R3) |
| G4 | 제한값의 포함·불포함 경계와 edge 정의 | off-by-one을 설명할 수 있어야 함 | 10장 | `nested`, `node`, `guard`, Call (S1) |
| G5 | 대입 LHS를 "파싱 후 검증"하는 방식 | REPL 판정과 연결됨 | 04장 | `Parser.assignment` (S4) |
| G6 | depth 검사 시점(인수 평가 후)의 부수 효과 | 호출 실패 유형별 차이 | 08장 | Call 분기 (S6) |
| G7 | REPL global의 late binding | lexical scope의 예외 같은 동작 | 11장 | SPEC F1, T-REPL-7 (S7) |
| G8 | heap frame과 JS 스택의 구분 | 이중 depth guard의 존재 이유 | 08·10장 | `new Environment`, `guard` (S11) |
| G9 | `E_ZERO_DIVISION` 대 `E_NONFINITE` | 수치 의미론 | 05장 | `binary` (S9) |
| G10 | 복잡도와 메모리 보존 범위 | 설계 trade-off 질문 대비 | 14장 | S15, S16 |
| G11 | `NULL`은 하나뿐인 객체(singleton) | `primitive(null)`이 항상 같은 객체를 반환 | 05장 | `runtime-values.ts`의 `NULL` |
| G12 | Interpreter 카운터는 Session에 묶여 REPL 내내 유지되고 finally로 복원됨 | 오류 후 REPL이 계속 동작하는 이유 | 11장 | `Session.interpreter`, `guard`의 finally |

---

## 5. 학습 순서 개선 제안

현재 00 → 15의 직선 순서는 대체로 자연스럽다. 다만 다음 네 곳은 앞 장이 뒤 장 개념을 미리 쓰거나, 종합 장의 위치가 아쉽다.

1. **10장을 둘로 나눈다.**
   - **10a 진단과 위치**(오류 class, code, span, anchor, `formatError`)를 04장 직후에 둔다. 02~04장이 이미 `E_NUMBER`, `E_EXPECTED`, `E_ASSIGN_TARGET`을 언급하고, 11장의 REPL 분류도 parser 오류 구조(`incompleteCandidate`)에 의존하기 때문이다.
   - **10b 자원 제한**(nesting, height, evaluation, call depth, `RangeError`)은 08장(호출) 뒤에 둔다. call depth는 호출 frame을 배운 뒤에야 의미가 있다.
2. **06장과 07장의 의존을 미리 알려 준다.** 06장은 `prepare`, `statement`의 Block 분기, `list`를 쓰는데, 이것들은 07장의 실행 구조다. 06장 첫머리에 "Interpreter는 `evaluate`(값)와 `statement`(completion)로 나뉜다"는 3줄 요약을 넣거나, 07장 3절 첫 단락을 06장 앞으로 옮긴다.
3. **14장과 15장의 순서를 바꾼다.** 15장(전체 추적)으로 모든 개념을 한 흐름에 연결한 다음, 14장(왜 이렇게 설계했나)으로 종합하는 편이 "무엇을 → 왜" 순서로 자연스럽다.
4. **12장과 13장을 마지막 묶음으로 옮긴다.** 테스트 전략은 구현 전체를 이해한 뒤에 "어떤 버그를 잡는가"로 읽어야 효과가 크고, benchmark는 선택 학습으로 둔다.

제안 순서:

```text
00 → 01 → 02 → 03 → 04 → 10a → 05 → 06 → 07 → 08 → 10b → 09 → 11 → 15 → 14 → 12 → 13
```

09장(배열·대입)은 10b 뒤에 두어도 무방하다. 09장 예제는 깊이 제한과 무관하고, 08장의 frame 개념만 있으면 충분하다.

---

## 6. 면접 전에 반드시 이해해야 할 핵심 15개

각 항목은 **설명할 문장**, **코드 근거**, **예상 꼬리 질문** 순으로 적었다.

1. **실행 pipeline과 책임 분리**
   - 설명: SourceUnit → `lex` → `Parser` → Program(AST 데이터) → `Interpreter`(Environment 참조) → 출력 callback 순으로 흐른다. AST에는 실행 메서드가 없고, `evaluate`/`statement`의 exhaustive switch가 실행한다.
   - 근거: `runner.ts`의 `runSource`/`createSession`, `interpreter.ts`
   - 꼬리 질문: AST에 `evaluate` 메서드를 두지 않은 이유는? 새 노드를 추가하면 어디가 타입 오류로 드러나나?

2. **위치 모델**
   - 설명: offset은 0-based UTF-16, line/column은 1-based, span은 끝 미포함이다. CR·LF·CRLF는 원문을 그대로 보존하고, BOM은 offset만 소비한다. 위치 변환은 `lineStarts` 이진 탐색이다.
   - 근거: `SourceUnit` constructor/`position`
   - 꼬리 질문: 이모지 앞 caret이 화면에서 어긋나는 이유는?

3. **precedence와 associativity**
   - 설명: 우선순위 사다리 함수가 우선순위를 표현한다. `binary`의 while 루프는 왼쪽 결합, `assignment`의 재귀는 오른쪽 결합을 만든다. postfix는 반복 체인이다.
   - 근거: `Parser.binary`, `assignment`, `postfix`
   - 꼬리 질문: 왼쪽 재귀 문법을 그대로 구현하면 무엇이 문제인가?

4. **parser의 정적 제약**
   - 설명: 대입 대상은 Identifier/Index만 허용하고 Group은 거절한다. 함수 밖 return(`functionDepth`)과 중복 선언(`registerName`, 이름을 읽는 즉시)도 parser가 검사한다. LHS는 먼저 파싱한 뒤 검증한다.
   - 꼬리 질문: `(a)=1`은 거절하고 `(a)[0]=1`은 허용하는 이유는? `1+2 =`가 REPL에서 incomplete가 아닌 이유는?

5. **RuntimeValue**
   - 설명: tag가 7가지인 union이다. falsy는 `false`와 `null`뿐이다. primitive는 payload로, 배열과 함수는 identity로 비교한다. 암묵 변환이 없고, `&&`/`||`는 선택된 피연산자를 그대로 반환한다.
   - 근거: `truthy`, `equal`, `binary`
   - 꼬리 질문: JS로 구현했는데 `0`이 truthy일 수 있는 이유는?

6. **Environment와 BindingCell**
   - 설명: own `Map`과 parent로 이루어진다. cell 상태는 `uninitialized | initialized`이고, 쓰기 가능 여부는 `mutable`이 따로 가진다. `lookup`은 가장 가까운 cell에서 멈추고, `reference`가 TDZ와 readonly를 검사한다.
   - 꼬리 질문: uninitialized를 `null`로 표현하면 무엇이 깨지나?

7. **hoisting, TDZ, shadowing (`prepare`의 세 순회)**
   - 설명: 충돌 검사 → 모든 직접 let/fn 예약 → fn만 초기화 순서다. TDZ cell은 parent 검색을 막는다. 블록은 진입할 때 준비되고, 함수 본문 최상위는 매개변수 frame을 그대로 쓴다.
   - 꼬리 질문: 세 순회를 하나로 합치면 무엇이 달라지나? `{print(x); let x=1;}`이 바깥 x를 읽지 않는 이유는?

8. **closure와 recursion**
   - 설명: 함수 값은 선언 환경을 참조로 붙잡는다. 호출 frame의 parent는 `callee.closure`다. 같은 factory 호출에서 만든 함수끼리는 cell을 공유하고, 다른 호출끼리는 독립이다. 재귀는 일반 이름 조회로 이루어지므로, 함수 이름을 재대입하면 재귀 목적지도 바뀐다.
   - 근거: `new Environment(callee.closure)`
   - 꼬리 질문: dynamic scope라면 결과가 어떻게 달라지나? 환경 전체를 capture할 때의 메모리 비용은?

9. **호출 순서**
   - 설명: callee → callable 검사 → arity → 인수 좌→우 → (builtin 호출) 또는 (depth 검사 → frame → `prepare` → body)
   - 꼬리 질문: arity 오류와 call depth 오류에서 인수의 부수 효과는 각각 어떻게 되나? (ADV-06)

10. **대입 평가 순서와 배열 참조 의미론**
    - 설명: target reference(cell 또는 {array, index})를 먼저 검증·확정하고, 그다음 RHS를 평가하고, 확정한 위치에 저장한다. 배열은 공유되는 mutable 객체이고, 재바인딩과 내부 변경을 구분한다.
    - 근거: `indexReference`, Assign 분기, BRC-06, T-ASG-4
    - 꼬리 질문: `a[0]=(a=[9])`의 결과는? `missing=print(1)`은 무엇을 출력하나?

11. **return 전파**
    - 설명: `Completion = normal | return(value)`다. `list`, Block, If, While은 completion을 그대로 넘기고, 오직 Call이 소비한다. 오류는 별도로 throw한다.
    - 꼬리 질문: return을 예외로 구현하면 무엇을 조심해야 하나? 중첩 함수의 return이 바깥 함수를 끝내지 않는 이유는?

12. **source-aware 오류**
    - 설명: 오류는 kind, code, message, span을 함께 가진다. anchor 규칙(S2)이 있고, 함수 안에서 난 오류는 정의된 소스 위치를 가리킨다. `E_DUPLICATE`와 `E_REDECLARE`는 다르다. exit code는 0/1/2다.
    - 근거: `LangError`, `formatError`, `cli/run.ts`
    - 꼬리 질문: `LangTypeError`가 `LangRuntimeError`의 하위 클래스가 아닌 이유와 그 영향은?

13. **depth guard**
    - 설명: nesting 64, AST height 128, evaluation 256, call 64는 각각 다른 대상을 센다(S1의 경계 표). JS 스택을 지키기 위한 장치이고, `RangeError`는 단계별로 변환된다(R3). finally는 카운터만 복구한다.
    - 꼬리 질문: callDepth가 64 이하인데도 `E_EVAL_DEPTH`가 날 수 있는 이유는? `while(true){}`는 왜 막지 못하나?

14. **REPL persistent session**
    - 설명: 같은 Session을 계속 쓴다. 매 submission마다 버퍼 전체를 다시 파싱하고, `incompleteCandidate`로 complete/incomplete/invalid를 나눈다.
      - 세미콜론은 마지막 최상위 expression에서만 생략할 수 있다.
      - echo는 최상위 expression의 null이 아닌 값에만 한다.
      - 충돌 preflight는 무실행, runtime 오류는 부분 효과를 남기고 TDZ cell도 남긴다.
      - global은 늦게 생길 수 있다(late binding).
    - 근거: `Repl.submitLine`, `classify`, `Parser.statement`의 repl 모드
    - 꼬리 질문: 괄호 개수를 세는 방식이 틀리는 입력은? `let b=1/0;` 뒤 b를 복구할 수 없는 이유는?

15. **검증 전략**
    - 설명: 명세에서 도출한 사례 테스트와 정확한 오류 계약(BRC-01), 경계 테스트(BRC-02), child process 격리(safety, CLI), 결정적 fuzz(invariant 중심, oracle 없음), adversarial review, mutation 비교를 함께 쓴다.
    - 꼬리 질문: fuzz가 BR-01을 놓친 이유는? "모든 테스트 통과"가 보장하지 않는 것은?

---

## 부록: 검토 중 실행 확인한 사항

- 교재 예제 출력: 00(3), 01(Hello, World!), 02(12), 03(7), 04(`7 7 5`), 05(3줄), 06(inner), 07(2), 08(`1 2 11`, 6), 09(`[[9]] [9] true`), 13(3), 14(1), 15(`[6] [6] true`). 모두 실제 실행과 일치한다.
- 오류 예제: 09장 `a[1]=print(99)`는 `E_INDEX_RANGE`이고 출력이 없다. 10장 진단은 `RuntimeError at trace.lang:2:8`과 caret 7칸으로 문자 단위까지 일치한다. 12장 `missing=print(1)`은 `E_UNDEFINED`이고 출력이 없다.
- 확인 문제 해설: `f(print(1),print(2))`는 `E_ARITY`이고 출력이 없다. `1[print(99)]`는 `E_INDEX_BASE`이고 출력이 없다. 블록 TDZ, `let x=1;{x=print(5);let x=2;}`는 `E_TDZ`이고 출력이 없다.
- 13장의 benchmark 서술(배치 크기 compile 10, error 100, 타이머 구간, median 산출)은 `benchmarks/worker.ts`, `workloads.ts`와 일치한다.
