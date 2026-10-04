# 00 프로젝트 전체 지도

[학습 목차](README.md) · 다음: [Runner](01-runner-pipeline.md)

## 1. 이 개념이 왜 필요한가

코드를 파일 순서대로 읽으면 숫자를 읽는 코드, 함수를 호출하는 코드, 터미널을 여는 코드가 뒤섞여 보인다. 먼저 각 단계의 입력과 출력을 알아야 지금 읽는 함수가 무엇을 책임지는지 판단할 수 있다. 이 장의 목표는 전체 파일을 암기하는 것이 아니라, 궁금한 동작이 생겼을 때 찾아갈 위치를 정하는 것이다.

## 2. 일반적인 CS 개념

언어 처리기는 보통 원문을 분석하는 전단과 분석 결과를 실행하거나 변환하는 부분을 나눈다. Lexer는 문자에서 토큰을, parser는 토큰에서 문법 구조를 만든다. AST는 이 구조를 담는 데이터다. Interpreter는 구조가 뜻하는 계산을 수행한다. 환경(environment)은 이름과 실행 값을 연결한다.

이 구분이 모든 언어에 동일한 구현을 강제하지는 않는다. 컴파일러는 AST를 다른 코드로 변환할 수 있고, VM은 명령어 배열을 실행할 수 있다. 입력·출력 처리는 언어 의미와 분리할 수 있다.

## 3. Mini-Lang에서는 어떻게 설계했는가

Mini-Lang은 AST를 직접 따라가는 tree-walk interpreter다. 기계어·bytecode 생성 단계는 없다. 실행기는 환경을 계속 참조하며, CLI는 흐름의 입구와 출구를 맡는다. 따라서 Environment와 CLI를 단순히 AST 다음에 순차 통과하는 변환 단계로 보면 안 된다.

```text
CLI / REPL → SourceUnit → lex → Token[] → Parser → Program
                                                    ↓
                                               Interpreter
                                                    ↕
                                               Environment
                                                    ↓
                                      builtin / echo → 출력 callback
```

## 4. 실제 저장소의 파일 / 함수 / 타입

| 파일 | 찾아볼 항목 | 책임 |
|---|---|---|
| [source-location.ts](../../src/source-location.ts) | SourceUnit, Span | 원문·위치 |
| [token.ts](../../src/token.ts), [lexer.ts](../../src/lexer.ts) | Token, lex | 문자 분류 |
| [ast.ts](../../src/ast.ts), [parser.ts](../../src/parser.ts) | Expr, Stmt, Program, parse | 구문 구조 |
| [runtime-values.ts](../../src/runtime-values.ts) | RuntimeValue, binary | 실행 값·연산 |
| [environment.ts](../../src/environment.ts) | BindingCell, Environment | 이름·상태 |
| [interpreter.ts](../../src/interpreter.ts) | prepare, evaluate, statement | 실제 실행 |
| [builtins.ts](../../src/builtins.ts), [value-format.ts](../../src/value-format.ts) | createBuiltins, formatValue | 기본 함수·표시 |
| [errors.ts](../../src/errors.ts) | LangError, formatError | 진단 |
| [runner.ts](../../src/runner.ts), [index.ts](../../src/index.ts) | Session, runScript, 재수출 | 조립·공개 API |
| [repl.ts](../../src/repl.ts) | Repl, ReplPorts | 대화형 입력 규칙 |
| [cli/run.ts](../../src/cli/run.ts), [cli/repl.ts](../../src/cli/repl.ts) | main, readline 연결 | Node 파일·터미널 |

주변 파일도 목적을 구분한다.

- [README](../../README.md)는 실행 안내, [SPEC](../../SPEC.md)은 동작 계약, [GRAMMAR](../../GRAMMAR.md)는 문법, [ARCHITECTURE](../../ARCHITECTURE.md)는 책임 분리다.
- [DESIGN_REVIEW](../../DESIGN_REVIEW.md)는 A~K 결정·위험·테스트·구현 순서, [PROGRESS](../../PROGRESS.md)는 작업 기록이다. [LIMITATIONS](../../LIMITATIONS.md)와 [FUTURE](../../FUTURE.md)는 현재 제약과 향후 후보를 구분한다.
- tests의 모듈별 테스트와 integration, helpers, fuzz는 12장, benchmarks와 결과 JSON은 13장에서 파일별로 연결한다. examples에는 15개의 .lang/.expected 쌍이 있다.
- [package.json](../../package.json)은 명령·의존성, package-lock.json은 설치 버전 고정, tsconfig 계열은 타입 검사·빌드 범위, vitest.config.ts는 테스트 설정이다. [check-any.mjs](../../scripts/check-any.mjs)는 explicit any 검사다.
- dist, .tmp, node_modules는 빌드·임시 결과·설치 의존성이며 핵심 구현의 출발점이 아니다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
print(1 + 2);
```

1. SourceUnit은 위 원문을 보관한다.
2. Lexer는 print, 괄호, 숫자, +, 세미콜론, EOF를 토큰으로 만든다.
3. Parser는 호출의 인수가 덧셈인 AST를 만든다.
4. Interpreter는 환경에서 print를 찾고 인수를 계산한다.
5. 숫자 3을 받은 builtin이 출력 callback에 문자열을 보낸다.

표준 출력:

```text
3
```

## 6. 흔히 헷갈리는 부분

AST는 실행 값이 아니다. Token의 숫자 payload가 있어도 덧셈까지 계산한 것은 아니다. TypeScript로 구현되어 있어도 Mini-Lang 소스를 JavaScript의 eval로 실행하지 않는다. Environment는 AST의 이름을 실제 값에 연결하는 실행 중 구조다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

현재의 모듈 분리는 파싱만 검사하거나 터미널 없이 실행을 검사하기 쉽게 한다. 대안인 단일 파일 구현은 시작이 빠르지만 오류 원인과 테스트 책임이 섞이기 쉽다. VM은 실행 효율의 후보가 될 수 있으나 bytecode·명령어 실행기·별도 디버깅 계층이 필요하다. 현재 저장소에는 VM이 없다.

## 8. 반드시 기억할 핵심 3~5개

- Lexer와 parser는 원문을 실행 가능한 구조로 바꾼다.
- Interpreter는 AST를 실행하고 Environment에서 이름을 찾는다.
- 출력은 callback으로 외부에 전달된다.
- 명세·구현·검증 기록은 서로 다른 자료다.

## 9. 확인 문제

1. 곱셈이 덧셈보다 먼저 묶이는 구조를 만드는 모듈은?
2. undefined variable을 확인하려면 어느 파일을 먼저 볼까?
3. 터미널 없이 print 결과를 모으려면 어디를 바꾸어 전달할까?

<details>
<summary>해설</summary>

1. Parser. 실행 시 연산 규칙은 runtime-values와 interpreter가 맡는다.
2. environment.ts의 lookup. 파서는 이름의 런타임 값을 알지 못한다.
3. runner에 전달하는 output callback. production 코드를 바꾸라는 뜻이 아니다.
</details>

## 10. 내 말로 설명해볼 질문

- 소스 파일에서 화면 출력까지 다섯 문장으로 설명해보자.
- 문법 오류와 실행 중 이름 오류가 서로 다른 단계에서 생기는 이유를 설명해보자.
