# Mini-Lang

**한국어** | [English](./README.en.md)

TypeScript로 직접 작성한 교육용 tree-walk interpreter입니다. Lexer와 recursive-descent Parser가 source 위치를 보존하고, interpreter가 lexical environment와 mutable binding을 통해 함수·closure·재귀·배열을 실행합니다.

## 설치와 실행

Node.js 20 이상과 npm이 필요합니다. 검증한 실행 환경은 Windows의 Node 20.20.2와 24.16.0입니다. 프로젝트 루트에서 실행합니다. PowerShell에서 npm 실행 정책 제한이 있으면 `npm` 대신 `npm.cmd`를 사용합니다.

```sh
npm ci
npm run run -- examples/01-hello-world.lang
npm run repl
```

두 실행 명령은 먼저 TypeScript를 빌드합니다. 이미 빌드한 파일을 실행할 때는 다음 명령을 사용할 수 있습니다.

```sh
npm run build
node dist/cli/run.js examples/14-bubble-sort.lang
node dist/cli/repl.js
```

script의 stdout에는 `print` 출력만 기록합니다. 언어 오류는 stderr와 exit code 1, 사용법·파일 I/O·내부 오류는 exit code 2, 정상 종료는 0입니다.

## 언어 사용 예

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

출력은 다음과 같습니다.

```text
1 2
[10, 1, 2] 3
```

지원 값은 finite number, string, boolean, null, array, user function, builtin입니다. 변수는 `let x = expr;`, 함수는 `fn name(args) { ... }`로 선언합니다. `if/else`, `while`, `return`, 대입, 산술·비교·논리 연산, 배열 읽기·쓰기, chained call을 지원합니다. `print`와 `len` 외의 builtin은 없습니다.

동일 scope에서 이름을 재선언할 수 없습니다. scope 진입 시 함수는 먼저 초기화되고 `let`은 선언 실행 때 초기화됩니다. 따라서 선언 전 함수를 호출할 수 있지만 초기화되지 않은 `let`을 읽거나 쓰면 오류입니다. closure는 선언 환경의 같은 binding을 공유하고, factory의 서로 다른 호출은 독립된 상태를 갖습니다.

`false`, `null`만 falsy입니다. 0과 빈 문자열·배열은 truthy입니다. `&&`와 `||`는 단락 평가하며 선택된 피연산자를 반환합니다. 다른 타입 사이의 암묵 변환은 없습니다. `+`는 number끼리 또는 string끼리만 허용합니다. 배열·함수의 equality는 참조 동일성입니다.

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

- 입력 간 global과 closure 상태를 유지합니다. 언어 오류 후에도 다음 입력을 받습니다.
- 기본 prompt는 `> `, 추가 입력 prompt는 `... `입니다. stdin을 pipe로 받으면 prompt를 표시하지 않습니다.
- 마지막 최상위 expression의 `;`만 생략할 수 있습니다. `let`·`return`·block 내부 문장은 세미콜론이 필요합니다.
- 최상위 expression의 null 이외 결과를 표시합니다. 명시적 세미콜론도 출력을 숨기지 않습니다. `print`는 null을 반환하므로 중복 표시되지 않습니다.
- 완성된 입력 전체를 한 번만 실행합니다. `1+`는 다음 줄을 기다리지만 잘못된 구문이나 닫히지 않은 문자열은 즉시 오류입니다.
- `if`의 `}`에서 문장이 완성되므로 else를 이어 쓰려면 `} else {` 또는 `} else`를 같은 줄에 입력합니다.
- 문법 오류는 아무 효과도 실행하지 않습니다. runtime 오류 전에 완료한 출력·변경은 유지합니다. `let a=1;let b=1/0;` 뒤 a는 1이고 b는 TDZ에 남아 재선언·대입할 수 없습니다. 새 이름을 사용하거나 REPL을 재시작합니다.
- 입력 대기 중 Ctrl+C는 pending 입력을 취소합니다. EOF는 종료하며, 미완성 입력이 남으면 오류와 exit 1입니다. 동기 실행 중 무한 loop는 세션을 유지하는 방식으로 취소하지 못합니다.

## 검증

```sh
npm run check
npm run test:integration
npm run test:examples
```

`check`는 전체 Vitest 테스트, strict typecheck, `src/`의 explicit any 검사를 수행합니다. `check:any`는 TypeScript compiler API로 AnyKeyword를 찾으므로 주석·문자열의 `any`는 오탐하지 않습니다. 명시적 any 예외는 없습니다. 테스트 실행 시 compiled CLI 검증을 위해 src 빌드를 한 번 수행합니다.

위험 실행은 별도 child process와 부모 deadline으로 보호합니다. synchronous loop를 Vitest timeout만으로 제어한다고 가정하지 않습니다. [위험 대응표](RISK_COVERAGE.md)는 40개 위험과 실제 테스트를 연결하며, [진행 기록](PROGRESS.md)은 검증 수·환경·커밋·재개 상태를 기록합니다.

## 예제

모든 `.lang`를 자동으로 발견해 같은 stem의 `.expected`와 stdout 전체를 비교합니다. CRLF만 LF로 정규화하고 공백·마지막 개행은 보존합니다. 누락·고아 expected 및 15개 미만 예제는 실패합니다.

| 파일 | 내용 |
|---|---|
| `01-hello-world.lang` | 문자열 출력 |
| `02-variables-arithmetic.lang` | 변수와 연산 우선순위 |
| `03-conditionals.lang` | if/else |
| `04-while-loop.lang` | 반복과 누적 |
| `05-fizzbuzz.lang` | FizzBuzz 1~15 |
| `06-factorial.lang` | 재귀 factorial |
| `07-fibonacci-recursive.lang` | 재귀 Fibonacci |
| `08-fibonacci-iterative.lang` | 반복 Fibonacci |
| `09-closure-counter.lang` | 상태를 보존하는 closure |
| `10-nested-closures.lang` | 중첩 capture |
| `11-lexical-shadowing.lang` | lexical scope와 shadowing |
| `12-array-operations.lang` | 배열 읽기·쓰기·길이 |
| `13-array-traversal.lang` | 배열 순회 |
| `14-bubble-sort.lang` | Mini-Lang 자체 bubble sort |
| `15-recursion-array-sum.lang` | 재귀와 배열 |

## 구조와 문서

```text
src/
  source-location.ts, token.ts, lexer.ts, ast.ts, parser.ts
  runtime-values.ts, value-format.ts, environment.ts, interpreter.ts
  builtins.ts, errors.ts, runner.ts, repl.ts
  cli/run.ts, cli/repl.ts
tests/                 단위·회귀·통합 테스트와 process helper
examples/              15개 프로그램 및 expected
scripts/check-any.mjs   explicit any 검사
```

흐름은 Source → Tokens → AST → Interpreter → RuntimeValue입니다. AST와 값은 discriminated union이며 실행은 exhaustive switch, return은 completion record, 오류는 source-aware exception으로 분리합니다. I/O는 runner output callback 및 REPL ports로 주입하고 Node 파일·터미널 의존성은 CLI에 둡니다.

전체 규칙은 [SPEC](SPEC.md), EBNF는 [GRAMMAR](GRAMMAR.md), 모듈 책임은 [ARCHITECTURE](ARCHITECTURE.md), 제약은 [LIMITATIONS](LIMITATIONS.md), 미구현 확장 방향은 [FUTURE](FUTURE.md)를 참조합니다. `DESIGN_REVIEW.md`는 사전 확정 설계 원본으로 유지합니다.

## 개발 과정과 AI 협업

이 프로젝트는 설계, 구현, 테스트, 리뷰, 문서화 과정에서 AI 도구를 적극적으로 활용했습니다. 설계 문서, 구현, 초기 검증은 AI 모델(Astra)이 진행했고, [blind review](CLAUDE_BLIND_REVIEW.md)와 [cross-model review](CROSS_MODEL_REVIEW.md)는 다른 AI 모델(Claude)이 수행했습니다. 이 리뷰들은 모두 AI 모델이 한 것이며, 사람 리뷰어의 코드 리뷰가 아닙니다.

작성자는 단계별 작업 지시와 완료 조건을 정의하고, 리뷰를 반복 요청하고, 결과를 검증해 채택하는 방식으로 진행했습니다. 저장소에는 설계 결정([DESIGN_REVIEW](DESIGN_REVIEW.md)), 위험별 테스트 연결([RISK_COVERAGE](RISK_COVERAGE.md)), 리뷰와 fuzz 기록([ADVERSARIAL_REVIEW](ADVERSARIAL_REVIEW.md), [FUZZ_REVIEW](FUZZ_REVIEW.md)), 알려진 한계([LIMITATIONS](LIMITATIONS.md))를 함께 남겼습니다.

## 공개 저장소 안내

이 저장소는 개발 history 대신 검증을 마친 최종 상태로 시작합니다. [PROGRESS](PROGRESS.md), 리뷰 보고서, `docs/study/`에 나오는 7자리 commit hash(예: `5c248fe`)는 비공개 개발 history의 commit을 가리키며, 이 저장소에서는 조회할 수 없습니다. 기록된 수치와 결론은 그 시점의 결과이고, 이 저장소의 소스와 테스트는 마지막 개발 commit과 같습니다.

## 라이선스

MIT. [LICENSE](LICENSE)를 참조합니다.
