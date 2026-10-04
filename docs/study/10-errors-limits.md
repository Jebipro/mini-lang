# 10 Error / Source Location / Depth Guard

[학습 목차](README.md) · 이전: [배열과 대입](09-arrays-assignment.md) · 다음: [REPL과 CLI](11-repl-cli.md)

이 파일은 권장 순서에서 두 번 읽는다. **10a 진단/위치**는 04장 다음에 1~2절, 3절의 진단·anchor, 4절의 파일 목록, 5절을 읽는다. **10b 자원 제한**은 08장 다음에 3절의 제한 표, 4절의 RangeError 변환과 6~10절을 읽는다. 파일 번호와 기존 링크는 유지한다.

## 1. 이 개념이 왜 필요한가

사용자가 고칠 수 있는 언어 오류와 구현 내부 실패를 구분해야 한다. 오류 위치가 틀리면 올바른 예외 종류만으로는 도움이 부족하다. 깊은 입력과 재귀는 호스트 스택을 소진할 수 있으므로 어떤 구조를 제한하는지도 명확해야 한다.

## 2. 일반적인 CS 개념

Structured diagnostic은 종류·코드·메시지·위치를 분리해 보관한다. Source span은 원문의 범위를, anchor는 진단을 가리킬 기준점을 표현한다. Resource guard는 정해진 자원 예산을 넘기 전에 제어된 오류를 낸다. 동시 활성 깊이와 전체 실행 횟수는 다르다. 깊이 제한이 실행 시간 제한을 대신하지는 않는다.

## 3. Mini-Lang에서는 어떻게 설계했는가

<a id="diagnostics"></a>

**10a — 진단과 위치**

LangSyntaxError, LangRuntimeError, LangTypeError는 모두 LangError를 상속한다. LangTypeError는 의미상 실행 중 오류지만 LangRuntimeError의 하위 클래스는 아니다. kind는 표시용 종류, code는 E_TDZ 같은 식별자, span은 원본 위치다.

offset은 0-based UTF-16, line/column은 1-based UTF-16이고 end는 미포함이다. 탭을 화면의 여러 칸으로 계산하지 않는다. formatter는 줄의 탭을 공백 하나로 바꾼다. AST가 SourceUnit을 참조하므로 과거 REPL 함수의 오류도 정의 소스를 유지한다.

어느 위치를 가리키는지는 오류마다 다르다. 전체 expression.span을 항상 사용하는 것은 아니다.

| 오류 | 진단 시작 위치 | 구현 근거 |
|---|---|---|
| E_UNDEFINED / E_TDZ / E_READONLY | 조회·대입 대상 이름 첫 글자 | get/reference에 Identifier.span 전달 |
| E_ASSIGN_TARGET | '=' | Parser.assignment의 anchor |
| E_OPERAND / E_ZERO_DIVISION / E_NONFINITE | 해당 unary/binary 연산자 | evaluate/binary의 anchor |
| E_NOT_CALLABLE / E_ARITY / E_CALL_DEPTH / E_LEN_TYPE | 호출의 '(' | Call.anchor, builtin.invoke에 전달 |
| E_INDEX_BASE | '[' | Index.anchor |
| E_INDEX_TYPE / E_INDEX_RANGE | index 식의 시작 | indexReference의 expr.index.span |
| E_DUPLICATE | 같은 scope에서 두 번째로 나온 이름 | Parser.registerName |
| E_REDECLARE | 기존 cell과 충돌하는 새 선언 이름 | prepare의 stmt.name.span |
| E_RETURN_CONTEXT | return 키워드 | Parser.statement |
| E_EXPECTED | 현재 토큰; 입력 끝이면 EOF | expect/primary |
| lexer의 문자·숫자·문자열 오류 | 원인별 위치 | [02장 오류 표](02-source-token-lexer.md) |

예를 들어 `[0][(2)];`의 범위 오류는 두 번째 '['가 아니라 index 식 Group의 시작인 '('를 가리킨다. 배열이라는 대상이 잘못되었는지, index 값이 잘못되었는지를 구별하는 기준이다. 함수 안의 연산 오류는 함수 정의 원문의 연산자를, 함수 호출 자체의 arity 오류는 호출한 원문의 '('를 가리킨다.

<a id="resource-limits"></a>

**10b — 자원 제한**

| 제한 | 실제 측정 대상 | 허용 | 거절·대체 | 검사 |
|---|---|---|---|---|
| parser nesting | 입력에 따른 재귀 edge | 활성 64개 | 65번째: E_INPUT_LIMIT | 증가 전 >=64 |
| AST height | Program/Stmt를 포함한 가장 긴 경로 | 128 | 129: E_INPUT_LIMIT | 계산 후 >128 |
| evaluationDepth | 활성 statement/evaluate guard 진입 | 256개 | 257번째: E_EVAL_DEPTH | 증가 전 >=256 |
| callDepth | 활성 user function 호출 | 64개 | 65번째: E_CALL_DEPTH | 증가 전 >=64 |
| formatter | 표시 경로의 배열 층수 | 64층 | 65번째 배열: `<max-depth>` | root depth=0, >=64 |

각 제한은 독립적이다. 함수 64개보다 적어도 본문 모양에 따라 evaluation guard가 먼저 작동할 수 있다.

Nesting은 괄호 문자 수가 아니라 입력 때문에 재귀하는 edge다. `(1)`은 1, `[]`는 0, `[[]]`는 1, `[[0]]`는 2다. 바깥 배열은 안쪽 빈 배열을 원소 식으로 읽을 때 1을 사용하고, 안쪽 빈 배열은 추가 원소가 없어 증가하지 않는다. 배열 65층이 빈 배열로 끝나면 원소 edge는 64개다. 순차 형제의 깊이는 누적하지 않으며 precedence 함수 사다리의 고정 호출 수도 세지 않는다.

AST 높이는 별도 계산이다. `f` 뒤 빈 호출 `()`를 125번 붙인 script는 Identifier 1 + Call 125 + Expression 1 + Program 1 = 128로 파싱 가능하다. 126번이면 높이 129로 거절한다. 이는 파싱 경계 예제이며 f가 정의되지 않은 프로그램을 실행해 성공한다는 뜻이 아니다.

Mini-Lang 호출 frame은 heap의 Environment 객체다. JavaScript call stack의 frame과 동일하지 않다. 하나의 언어 호출은 evaluate, guard, callback, list, statement 등 여러 JS 호출을 사용한다. callDepth는 언어 호출 수, evaluationDepth는 실행기의 중첩 평가 수를 제한해 호스트 스택을 보호한다. 구체적인 허용/거절 fixture는 BRC-02와 T-SAFE-1을 참조한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [errors.ts](../../src/errors.ts): LangError, 하위 오류, formatError.
- [source-location.ts](../../src/source-location.ts): position, span, lineText.
- [parser.ts](../../src/parser.ts): nested, node, program.
- [interpreter.ts](../../src/interpreter.ts): guard, rethrowRuntime, Call의 try/finally.
- [value-format.ts](../../src/value-format.ts): display.
- [blind-review.test.ts](../../tests/blind-review.test.ts)의 BRC-01/02, [integration/safety.test.ts](../../tests/integration/safety.test.ts).

<a id="host-limits"></a>

**10b — 단계별 RangeError 변환**

| 변환 위치 | 변환 결과 | 붙이는 위치 | 원래 cause |
|---|---|---|---|
| lex의 스캔 try/catch | LangSyntaxError / E_INPUT_LIMIT, host syntax limit exceeded | 현재 offset을 원문 길이 이하로 제한한 span | 보존하지 않음 |
| Parser.program의 try/catch | LangSyntaxError / E_INPUT_LIMIT, host syntax limit exceeded | 현재 peek() 토큰 span | 보존하지 않음 |
| 각 statement/evaluate guard의 catch | LangRuntimeError / E_HOST_LIMIT | 포착한 guard에 전달된 span | 보존 |
| Interpreter.execute의 catch | LangRuntimeError / E_HOST_LIMIT | Program.span | 보존 |

실행 단계에서는 가장 안쪽에서 RangeError를 포착한 guard가 먼저 변환한다. evaluate는 anchor가 있으면 anchor, 없으면 전체 expr.span을 사용하고 statement는 stmt.span을 사용한다. 이미 변환된 LangError는 바깥 guard가 다시 감싸지 않는다. execute의 catch는 prepare처럼 guard 밖에서 생긴 RangeError도 받는 마지막 방어다. [functions.test.ts](../../tests/functions.test.ts)의 T-SAFE-2가 두 경로를 확인한다.

명시적 guard 초과와 호스트 예외 변환도 구별한다. parser nesting 초과는 현재 토큰, AST 높이 초과는 node 생성의 start, evaluation 초과는 진입하려던 guard span, call 초과는 호출 '('를 쓴다. 모든 host Error를 언어 오류로 바꾸지는 않으며 CLI는 나머지를 InternalError로 처리한다. 카운터를 증가시킨 진입은 try/finally로 감소시킨다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

소스 표시 이름을 trace.lang으로 두고 다음 코드를 실행한다.

```mini-lang
print(1);
print(1/0);
```

첫 print는 완료된다. 두 번째의 '/'는 두 번째 줄 8번째 UTF-16 위치다. binary가 E_ZERO_DIVISION을 던지고 그 이후 실행은 중단된다. stdout에는 먼저 출력한 1과 LF가 남는다. formatError 결과는 다음과 같다.

```text
RuntimeError at trace.lang:2:8: division by zero
print(1/0);
       ^
```

스택이 깊어지는 오류에서도 finally가 실행되어 카운터를 복구한다. 그러나 이미 변경한 변수나 출력까지 롤백한다는 뜻은 아니다.

## 6. 흔히 헷갈리는 부분

최대 AST 높이 128은 괄호 128쌍 허용과 다르다. 호출 64회는 누적 64번 호출한 뒤 금지한다는 뜻이 아니다. while(true){}는 일정한 깊이로 영원히 돌 수 있다. 언어 자체에는 loop 횟수나 시간 제한이 없다. 공개 SourceUnit.position에 범위 밖 offset을 직접 전달하면 RangeError를 내는 것은 API 인수 검증이며 정상 소스 실행과 구분한다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

명시적 guard는 호스트 스택 한도보다 먼저 통제 가능한 실패를 만들기 위한 선택이다. RangeError fallback은 마지막 방어지만 내부 버그를 가릴 수 있다는 검토상의 비용도 있다. 반복형 evaluator/VM이나 trampoline은 호스트 재귀 의존을 줄일 수 있으나 실행 모델 변경이 필요하다. 시간 예산은 별도 기능이며 현재는 테스트 harness의 외부 deadline만 있다.

## 8. 반드시 기억할 핵심 3~5개

- 오류 종류·code·span을 함께 읽는다.
- 오류 위치와 화면상의 글자 폭은 동일한 개념이 아니다.
- nesting, AST height, evaluation, call depth를 구분한다.
- finally는 카운터를 복구하며 실행 효과를 롤백하지 않는다.
- 깊이 제한은 무한 반복을 막지 않는다.

## 9. 확인 문제

1. LangTypeError를 LangRuntimeError instanceof만으로 잡을 수 있는가?
2. print(1/0);에서 1은 출력되는가?
3. 안전하게 끝나는 함수를 1,000번 순차 호출하면 callDepth 64를 반드시 넘는가?

<details>
<summary>해설</summary>

1. 아니다. 공통 기반은 LangError다.
2. 아니다. print 인수 평가가 먼저 실패한다.
3. 아니다. 동시에 활성인 호출 수를 센다.
</details>

## 10. 내 말로 설명해볼 질문

- 프로그램 구조 제한과 실행 상태 제한을 각각 예를 들어 설명해보자.
- 오류 후 REPL이 계속 동작하려면 카운터 복구와 환경 보존을 어떻게 구분해야 하는지 설명해보자.
