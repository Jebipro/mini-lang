# 06 Environment / Lexical Scope / TDZ / Hoisting

[학습 목차](README.md) · 이전: [값](05-runtime-values.md) · 다음: [실행과 제어 흐름](07-interpreter-control-flow.md)

## 1. 이 개념이 왜 필요한가

같은 x라는 이름이 여러 블록에 있어도 각각 어떤 값을 뜻하는지 결정해야 한다. 아직 선언문을 실행하지 않은 이름과 존재하지 않는 이름도 구분해야 한다. 이 구조를 이해해야 closure를 단순한 값 복사로 오해하지 않는다.

07장을 읽기 전 필요한 실행기 구조만 먼저 정리한다.

- Interpreter.evaluate는 표현식을 계산해 RuntimeValue를 반환한다.
- statement는 문장을 실행해 normal 또는 return(value)인 Completion을 반환하고, list는 이를 순서대로 연결한다.
- prepare는 그 실행 전에 직접 선언의 cell을 준비한다. 이 장은 실행기 전체보다 그 실행에 전달되는 Environment를 살펴본다.

## 2. 일반적인 CS 개념

Lexical scope는 코드의 선언 위치를 기준으로 이름의 검색 관계를 정한다. Dynamic scope는 호출 관계를 따르는 다른 선택이다. Binding은 이름과 저장 위치의 연결이며 cell은 그 위치의 상태를 담는 표현이다. TDZ는 binding이 존재하지만 초기화 전 접근을 금지하는 구간이다. Hoisting은 선언이 앞에서도 보이는 효과를 뜻하며 실제로 소스 줄을 이동한다는 뜻은 아니다.

언어마다 hoisting과 초기화 규칙이 다르다. JavaScript의 var 규칙을 그대로 가져오면 안 된다.

## 3. Mini-Lang에서는 어떻게 설계했는가

Environment는 own Map과 parent를 가진다. BindingCell에는 name, mutable, declaration, state가 있다. state는 uninitialized 또는 initialized(value)다. lookup은 가장 가까운 cell에서 멈추고, reference가 초기화와 쓰기 가능 여부를 검사한다.

Interpreter.prepare는 세 번의 순회로 직접 선언만 처리한다.

1. 현재 환경의 기존 own 이름과 충돌하는지 모두 검사한다.
2. 직접 let/fn 이름을 모두 예약한다.
3. fn을 현재 환경을 캡처한 함수 값으로 초기화한다.

그 뒤 문장을 순서대로 실행하며 let initializer가 성공하면 cell을 초기화한다. 함수 선언문 실행은 이미 준비했으므로 no-op이다. 일반 블록은 자식 환경을 만들고, 함수 본문 최상위는 매개변수 frame 자체를 사용한다.

중복 이름은 확인할 수 있는 시점에 따라 두 오류로 나뉜다.

| 상황 | 검사 위치 | 오류 |
|---|---|---|
| 같은 소스 scope의 let/fn/매개변수 중복 | Parser.registerName, 이름을 읽은 즉시 | SyntaxError / E_DUPLICATE, 두 번째 이름 위치 |
| 새 submission의 선언과 기존 global 충돌 | Interpreter.prepare의 첫 순회 | RuntimeError / E_REDECLARE, 새 선언 이름 위치 |

Parser의 Set에는 이전 submission의 runtime global이 없다. 따라서 두 번째 경우는 파싱이 성공해도 실행 준비 단계에서 실패한다. Environment.reserve도 중복을 방어하지만 일반 REPL 경로는 prepare의 전체 충돌 선검사가 먼저 작동한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [environment.ts](../../src/environment.ts): CellState, BindingCell, reserve, initialize, lookup, reference, get, assign.
- [interpreter.ts](../../src/interpreter.ts): prepare, statement의 Let/Block/Function, Call의 frame 생성.
- [parser.ts](../../src/parser.ts): registerName, block(params)의 정적 중복 검사.
- [environment.test.ts](../../tests/environment.test.ts), [functions.test.ts](../../tests/functions.test.ts): TDZ, lexical scope, closure.

Interpreter의 식별자 대입은 assign에 RHS를 먼저 계산해 넘기지 않는다. reference(..., true)로 cell을 먼저 얻고 RHS를 평가해 그 cell.state에 저장한다. 09장에서 이 순서를 추적한다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
let x="outer";
{
  fn read(){return x;}
  let x="inner";
  print(read());
}
```

| 시점 | 블록 환경 상태 |
|---|---|
| prepare 예약 후 | read: uninitialized, x: uninitialized |
| fn 초기화 후 | read: closure=이 블록 환경, x: uninitialized |
| let 실행 후 | read: 함수, x: "inner" |
| read 호출 | 호출 frame → 선언 블록에서 x 검색 |

출력:

```text
inner
```

만약 print(read())를 let x 앞에 놓으면 E_TDZ다. 블록의 x가 이미 존재하므로 부모의 "outer"로 건너뛰지 않는다. 외부 x는 이 블록 실행으로 변경되지 않는다.

## 6. 흔히 헷갈리는 부분

uninitialized는 null이 아니다. 이름을 예약했다고 값을 읽을 수 있는 것도 아니다. 모든 중첩 블록의 이름을 프로그램 시작에 예약하지 않는다. 해당 블록에 진입할 때만 예약한다. while 본문의 블록 환경은 매 반복 새로 생긴다. 내장 함수는 readonly 부모 cell이지만 사용자 global의 같은 이름 선언은 shadowing으로 허용된다.

JavaScript에서 익숙한 이름을 보더라도 다음 범위를 구분한다.

| 익숙한 개념 | 비교해서 배울 점 | Mini-Lang에서 따를 규칙 |
|---|---|---|
| let의 TDZ | 이름 존재와 초기화가 다름 | uninitialized cell은 읽기·쓰기를 모두 거절 |
| 함수 hoisting | 선언문 이전 가시성 | 각 scope의 직접 fn을 prepare에서 초기화. JS의 블록 함수 선언 규칙 전체를 가져온 것은 아님 |
| REPL 선언 실패 | 입력 사이 상태가 남음 | 실패한 global initializer의 cell도 TDZ로 유지. 다른 JS REPL의 복구 정책을 가정하지 않음 |

이는 JavaScript 전체 규칙의 비교표가 아니라 오해하기 쉬운 유사점과 Mini-Lang의 명세를 구별한 표다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

Parent chain과 미리 예약한 cell은 가장 가까운 binding을 안정적으로 공유하게 한다. Resolver가 이름마다 lexical depth를 미리 정하는 대안은 검색 비용을 줄일 수 있지만 추가 pass와 persistent global 처리가 필요하다. 선언을 만날 때 처음 이름을 삽입하는 대안은 현재 TDZ·shadowing 계약을 바꾼다. prepare의 충돌 선검사는 기존 REPL global에 충돌할 때 새 이름이 일부만 예약되는 것을 방지한다.

## 8. 반드시 기억할 핵심 3~5개

- 선언 위치의 환경 체인을 따라 이름을 찾는다.
- 예약과 초기화는 다르다.
- TDZ cell을 찾으면 부모로 우회하지 않는다.
- 함수는 scope 준비 중 초기화되며 let은 선언 실행 때 초기화된다.
- 일반 블록과 함수 본문 최상위의 frame 규칙을 구분한다.

## 9. 확인 문제

1. let x=x;에서 외부 x가 있으면 initializer는 그것을 읽는가?
2. 함수 선언 앞에서 그 함수를 호출할 수 있는가?
3. fn f(x){let x=1;}은 허용되는가?

<details>
<summary>해설</summary>

1. 아니다. 현재 scope의 예약된 x에 접근해 TDZ 오류다.
2. 같은 scope의 직접 함수라면 가능하다. 함수 본문이 읽는 let의 초기화 상태는 별도 문제다.
3. 아니다. 매개변수와 본문 최상위 선언이 같은 scope다.
</details>

## 10. 내 말로 설명해볼 질문

- Hoisting과 TDZ가 모순이 아닌 이유를 cell 상태 변화로 설명해보자.
- scope 준비의 세 순회를 한 순회로 합치면 어떤 관찰 가능한 문제가 생길 수 있는지 설명해보자.
