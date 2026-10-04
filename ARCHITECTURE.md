# Mini-Lang Architecture

Source → Lexer → Tokens → Parser → AST → Interpreter → RuntimeValue

## D. Recommended Architecture

모듈은 역할별 최소 단위로 나눈다. 아래는 구현된 모듈의 경로다. 화살표 `A → B`는 A가 B에 의존한다는 뜻이다. output-port/repl-ports는 별도 패키지가 아니라 주입 callback과 ReplPorts interface를 뜻한다.

```text
token → source-location
ast → source-location
errors → source-location
lexer → token, errors, source-location
parser → token, ast, errors

runtime-values --type-only→ ast, environment
environment → runtime-values, errors
value-format → runtime-values
builtins → runtime-values, value-format, errors, output-port
interpreter → ast, runtime-values, environment, errors
runner → lexer, parser, interpreter, builtins, source-location
repl → runner, repl-ports
cli/run → runner, Node fs/process
cli/repl → repl, Node readline/process
```

RuntimeValue의 user function record는 closure Environment를 가리키므로 타입 수준의 상호 참조는 필요하다. `runtime-values`에서 Environment의 runtime import를 금지하고 `import type`만 사용한다. Environment 역시 RuntimeValue를 타입으로만 사용할 수 있다. 런타임 객체 생성은 interpreter/builtins가 담당한다. 따라서 JS 모듈 초기화 순환은 생기지 않는다. 이를 없애려고 closure를 `unknown`으로 저장하거나 과도한 interface 계층을 만들지 않는다.

| 모듈 | 책임·공개 계약 | 금지할 책임 |
|---|---|---|
| `src/source-location.ts` | SourceUnit(id, displayName, text, lineStarts), Position, Span, 원본 줄 추출 | 파싱·출력 |
| `src/token.ts` | TokenKind, lexeme, literal payload, span. EOF 포함 | operator 실행 |
| `src/lexer.ts` | SourceUnit → tokens. 불법 문자·escape·숫자 검증 | scope, 의미 분석 |
| `src/ast.ts` | immutable union shape, Program/Stmt/Expr 및 anchor 정의 | evaluate 메서드 |
| `src/parser.ts` | tokens + script/repl mode → Program 또는 structured parse diagnostic. 함수 문맥·중복 선언 검증 | RuntimeValue 생성, env 접근 |
| `src/runtime-values.ts` | primitive/array/user-function/builtin shape, truthiness·equality 등의 순수 helper | AST 실행, stdout |
| `src/environment.ts` | own cell 예약, 초기화, lookup reference, assign; 가장 가까운 binding 반환 | AST 스캔, caller 추적 |
| `src/interpreter.ts` | scope 준비, evaluate, execute, completion, call 경계와 깊이 카운터 | 파일 읽기, readline, 오류 직접 출력 |
| `src/builtins.ts` | builtin 객체 생성, print/len 구현, output callback 주입 | 별도 call/arity 경로, interpreter import |
| `src/value-format.ts` | 모든 표시 규칙, cycle 및 표시 깊이 처리 | equality 변경, 값 mutation |
| `src/errors.ts` | LangSyntaxError/LangRuntimeError/LangTypeError, diagnostic code, formatter | process.exit, stderr 직접 쓰기 |
| `src/runner.ts` | compile(SourceUnit, mode), createSession(output), execute(program, session), runScript | 콘솔 직접 의존, 오류를 문자열로만 축소 |
| `src/repl.ts` | buffer·source ID·parse 상태·지속 session 관리, 주입 ports로 echo/진단 | fs/readline/process 접근 |
| `src/cli/run.ts` | argv, UTF-8 fs, stdout/stderr, exit code 변환 | interpreter semantics |
| `src/cli/repl.ts` | readline adapter, Ctrl+C/EOF, prompt 표시 | 입력 완성 여부 재구현 |
| `scripts/check-any.mjs` | TypeScript compiler API로 `src/**/*.ts`의 AnyKeyword를 찾아 file:line:column 출력, 있으면 exit 1 | 문자열·주석의 단어 any를 금지하는 regex 검사 |
| `tests/` | 모듈 계약, 의미론·오류·CLI·REPL 검증 | 환경 내부 Map 구조를 의미론 정답으로 취급 |
| `examples/` | 15개 이상 프로그램과 expected | 호스트 sort 등으로 알고리즘 대체 |

AST의 kind는 Program, Let, Function, Block, If, While, Return, Expression; Literal, Identifier, Group, Unary, Binary, Logical, Assign, Array, Index, Call이다. Assign target은 Identifier 또는 Index의 union이며 parser가 다른 target을 차단한다. Function은 expression이 아니다. 선언 node에는 이름 span과 매개변수별 span이 있다. Parser는 scope별 이름 Set으로 중복을 즉시 검사하고, interpreter는 동일 statement 목록의 직접 선언을 scope 준비에 사용한다. 중복된 AST 사본이나 선언 목록 캐시는 만들지 않는다.

배열과 함수 등 runtime 객체만 mutable identity를 가진다. AST의 source span, 자식 목록, token은 읽기 전용이다. 단위 테스트에서는 필요한 AST 모양을 직접 검사할 수 있지만 모든 필드의 대형 snapshot에 의존하지 않는다.

| 선택 영역 | 비교 | 최종 선택과 근거 |
|---|---|---|
| AST | union: narrowing/exhaustiveness 간단, 위치 필드를 공통화; class: visitor/생성자 boilerplate, 클래스 identity에 테스트 결합 가능 | discriminated union. 향후 type checker는 별도 traversal을 추가할 수 있고 AST에 실행을 넣을 필요가 없음 |
| dispatch | Visitor: pass 확장에 적합하나 이 규모에서는 방문 인터페이스 반복; switch: 흐름이 한곳에 보임; node.evaluate: AST와 runtime 결합 | exhaustive switch evaluator/executor. 새로운 node 누락은 never 검증으로 typecheck 실패 |
| return | sentinel exception: 짧지만 오류 catch와 혼동; completion: 매 단계 전파가 필요하나 타입에 드러남; continuation: 과도함 | 명시적 completion record. J의 중첩 return 테스트로 누락 방지 |
| runtime 값 | JS 직접 값: tag/undefined/호스트 coercion 누출; tagged union: 검사 명확; class: 객체 계층·boilerplate 증가 | tagged union. VM 전환 시에도 값 계약을 유지하기 쉬움 |
| lexical scope | parent chain: 공유 cell·재귀에 자연스러움; immutable 값 snapshot: mutation/late binding 손상; resolver+depth: 정교하지만 추가 pass | parent chain + scope predeclaration. immutable cell 참조 snapshot은 가능하지만 이 범위에서 이점 부족 |

TypeScript의 discriminant narrowing과 `never` exhaustiveness는 공식 Handbook의 동작을 근거로 한다. 이 프로젝트에 union/switch를 선택한 것은 그 기능을 활용한 설계 판단이다. [TypeScript Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

빌드 형태는 ESM, TypeScript `NodeNext`, target ES2022, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 사용한다. runtime import의 `.js` 경로와 type-only import를 일관되게 적용한다. 빌드는 `tsc`, 테스트는 Vitest로 한다. 실행은 빌드된 JS를 Node로 실행하여 TS 직접 실행 도구를 필수 의존성으로 추가하지 않는다. 개발 의존성은 TypeScript, Vitest, Node 타입으로 제한하고 package-lock.json으로 고정한다. Vitest 4.1.11은 Node20 지원과 개발 의존성 감사 결과를 확인해 선택했다.

## 구현 메모

Parser의 name Set은 구문 제약 검사만 담당하며 runtime environment와 분리된다. 선언을 읽는 즉시 중복을 검사하여 이미 잘못된 REPL prefix를 incomplete로 오분류하지 않는다. Interpreter의 공통 guard는 evaluation counter를 finally로 복원하고 RangeError를 위치 및 원래 cause와 함께 변환한다. User call counter는 별도로 finally 복원한다. 이 구현 상세는 확정된 의미론을 변경하지 않는다.
