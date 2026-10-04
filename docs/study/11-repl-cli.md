# 11 REPL / Persistent Session / CLI

[학습 목차](README.md) · 이전: [오류](10-errors-limits.md) · 다음: [검증](12-testing-review.md)

## 1. 이 개념이 왜 필요한가

파일 전체를 한 번 실행하는 것과 사용자가 줄을 하나씩 입력하는 것은 다르다. 중괄호가 아직 닫히지 않은 코드를 오류로 버리지 않고 기다려야 하며, 이전 입력의 변수도 유지해야 한다. 터미널 이벤트와 언어의 입력 규칙을 나누어 이해하자.

## 2. 일반적인 CS 개념

REPL은 Read–Eval–Print–Loop의 반복이다. 입력 한 줄과 실행 단위가 반드시 같지는 않다. Persistent session은 입력 사이의 상태를 유지한다. Adapter는 운영체제 I/O를 core의 인터페이스에 연결한다. 오류 복구와 트랜잭션 롤백도 구별해야 한다.

## 3. Mini-Lang에서는 어떻게 설계했는가

Repl은 한 Session과 pending lines를 유지한다. submitLine은 줄을 추가하고 classify로 complete/incomplete/invalid를 판정한다. complete만 실행하고 incomplete는 추가 입력을 기다리며 invalid는 진단한다. EOF에서 더 필요한 토큰에 의해 생긴 incompleteCandidate를 이용하며 별도 괄호 개수 세기로 판단하지 않는다.

마지막 최상위 expression만 EOF에서 세미콜론을 생략할 수 있다. let과 블록 내부 문장은 생략하지 못한다. 실행한 최상위 expression의 null 이외 값은 echo하고 세미콜론이 있어도 숨기지 않는다. print는 NULL을 반환해 중복 echo가 없다.

Session.interpreter도 global처럼 입력 사이에 같은 객체다. callDepth와 evaluationDepth가 입력마다 새 객체로 초기화되는 것이 아니라, 실행 진입의 finally가 0으로 복구하므로 오류 후 다음 입력에도 재사용할 수 있다. pending buffer 초기화, 카운터 복구, global 효과 보존은 서로 다른 처리다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [repl.ts](../../src/repl.ts): ReplPorts, session, lines, sourceId, source, clear, submitLine, cancelInput, endInput.
- [parser.ts](../../src/parser.ts): ParseResult, classify, statement의 repl mode.
- [cli/repl.ts](../../src/cli/repl.ts): readline line/SIGINT/close 이벤트.
- [cli/run.ts](../../src/cli/run.ts): main, UTF-8 읽기, stdout/stderr handler.
- [repl.test.ts](../../tests/repl.test.ts), [runner.test.ts](../../tests/runner.test.ts), [integration/repl-cli.test.ts](../../tests/integration/repl-cli.test.ts).

ReplPorts는 출력·진단·prompt 함수다. core는 process나 readline을 직접 사용하지 않는다. Pending submission을 재파싱할 때 source ID는 유지하고 완료·오류·취소 후 새 ID를 사용한다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

아래는 독립 REPL 세션의 순차 입력이다. >와 ...는 소스가 아니라 prompt다.

```text
> let x=1;
> x=x+1
2
> fn twice(n){
... return n*2;
... }
> twice(x);
4
```

첫 submission은 global에 x를 만든다. 두 번째는 같은 cell을 2로 바꾸며 결과를 echo한다. fn 첫 줄은 incomplete라 실행하지 않는다. 닫는 중괄호를 받으면 전체 함수 선언을 한 번 실행한다. 마지막 호출은 명시적 세미콜론이 있어도 4를 표시한다.

오류 복구를 보는 별도 세션:

```text
> let a=1;let b=1/0;
```

E_ZERO_DIVISION 뒤 a=1은 남고 b는 예약된 uninitialized cell로 남는다. 다음 입력에서 a를 읽을 수 있지만 b=2는 TDZ, let b=2;는 재선언 오류다. 문법 오류라면 해당 submission의 실행 자체가 시작되지 않는다.

Submission의 실패 시점을 더 정확히 나누면 다음과 같다.

| 실패 시점 | 예 | 새 submission의 효과 |
|---|---|---|
| 구문 분석 | 같은 소스에서 이름 중복: E_DUPLICATE | prepare도 실행도 하지 않음 |
| 기존 global 충돌 preflight | 이전 x와 새 let x 충돌: E_REDECLARE | 새 이름 예약·함수 초기화·출력 전에 전체 충돌 검사에서 중단 |
| preflight 통과 후 문장 실행 | initializer의 E_ZERO_DIVISION | 앞선 출력·변경과 예약 cell을 유지 |

E_REDECLARE도 분류상 RuntimeError다. “런타임 오류면 항상 일부 효과가 생긴다”가 아니라, **실행 전 충돌 검사와 실제 문장 실행 중 오류를 구분**해야 한다. 기존 global에 `let old=1;`이 있을 때 다음 입력 `print(99);fn fresh(){return 2;}let old=3;`은 출력도 fresh 예약도 없이 실패하며 old=1은 유지된다. 이는 일반적인 트랜잭션 롤백이 아니라 변경 전 preflight의 결과다.

Global late binding도 참조 capture에서 나온다. 새 세션에 아래 입력을 순서대로 제출한다.

| 입력 | 결과 |
|---|---|
| `fn f(){return future;}` | f가 현재 global 객체를 캡처. 출력 없음 |
| `f();` | E_UNDEFINED: 아직 future cell이 없음 |
| `let future=3;` | 같은 global에 cell 추가·초기화 |
| `f();` | 3을 echo |

이것은 dynamic scope가 아니다. f가 캡처한 동일한 global 객체가 이후 변경된 것이다. 일반 블록은 진입 때 직접 선언을 모두 예약하지만 persistent global은 새 submission으로 이름이 더해질 수 있다. 코드 근거는 [regression.test.ts](../../tests/regression.test.ts)의 T-REPL-7, preflight 비교는 [adversarial.test.ts](../../tests/adversarial.test.ts)의 ADV-07이다.

## 6. 흔히 헷갈리는 부분

매 줄 runScript를 호출하면 새 Session 때문에 상태가 사라진다. REPL은 그렇게 구현하지 않았다. if의 닫는 중괄호에서 이미 complete가 되면 다음 submission의 else를 붙일 수 없다. 닫히지 않은 문자열은 추가 줄 대기 대상이 아니라 invalid다.

CLI에서 Ctrl+C를 cancelInput으로 연결하는 동작은 stdin과 stdout이 모두 TTY여서 readline의 terminal 모드가 켜진 경우에 해당한다. stdout을 파일로 redirect하는 등 terminal=false이면 이 readline SIGINT 취소 경로를 기대할 수 없으며 기본 프로세스 SIGINT 처리에 따라 종료될 수 있다. 이 adapter에는 별도 process SIGINT 복구 handler가 없다. Terminal 모드에서도 cancelInput은 pending 입력 취소이며 동기 무한 루프를 안전하게 끊고 같은 세션으로 복귀하는 기능은 아니다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

Parser를 다시 사용해 입력 완성 여부와 실제 문법이 어긋나지 않도록 했다. 비용은 pending 입력을 다시 파싱하는 것이다. Incremental parser는 재작업을 줄일 수 있지만 상태 복원이 복잡하다. 세션을 트랜잭션처럼 롤백하는 대안은 편리할 수 있으나 출력·공유 배열·closure의 부수 효과를 되돌리는 정책이 필요하며 현재는 이전 효과를 유지한다.

CLI의 정상 종료는 0, 언어 오류는 1, 사용법·파일 I/O·내부 오류는 2다. REPL은 개별 언어 오류 뒤 정상 EOF이면 0, 미완성 입력 EOF이면 1이다. 닫힌 stdout/stderr는 host I/O 실패로 다룬다. Prompt 표시와 readline의 Ctrl+C pending 취소는 모두 stdin/stdout 양쪽 TTY라는 같은 terminal 조건을 전제로 한다.

## 8. 반드시 기억할 핵심 3~5개

- 한 줄과 한 submission은 다를 수 있다.
- 세션은 유지하고 pending 입력은 별도로 초기화한다.
- 구문 오류는 무실행, 런타임 오류는 이전 효과 유지다.
- echo와 print는 다른 출력 경로다.
- core와 터미널 adapter를 구분한다.

## 9. 확인 문제

1. REPL의 let x=1은 바로 실행되는가?
2. {1+2;}는 3을 자동 echo하는가?
3. REPL에서 print(3);은 3과 null을 두 줄 출력하는가?
4. `1+2 =`는 왜 incomplete가 아닌가?
5. `let x=1;let x=`는 왜 RHS를 더 기다리지 않는가?
6. `let x =` 상태로 EOF가 오면 왜 exit 1인가?

<details>
<summary>해설</summary>

1. 아니다. 세미콜론을 기다린다.
2. 아니다. 블록 안에는 최상위 echo가 전달되지 않는다.
3. 아니다. print의 3만 출력하고 null echo는 생략한다.
4. assignment가 일반 식으로 읽은 LHS의 Binary kind를 '=' 위치에서 거절한다. E_ASSIGN_TARGET/invalid다.
5. registerName이 두 번째 x를 읽는 즉시 E_DUPLICATE를 내기 때문이다. 이전 global 충돌과 다른 parser 검사다.
6. endInput이 pending source를 다시 classify하고 complete가 아니면 진단 후 1을 반환한다. EOF는 빠진 initializer나 세미콜론을 보충하지 않는다.
</details>

## 10. 내 말로 설명해볼 질문

- 완성되지 않은 함수 입력이 바로 실행되지 않는 과정을 설명해보자.
- 오류 후 계속 입력할 수 있다는 말이 모든 상태를 되돌린다는 뜻이 아닌 이유를 설명해보자.
