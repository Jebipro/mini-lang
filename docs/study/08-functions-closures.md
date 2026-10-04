# 08 Function / Recursion / Closure

[학습 목차](README.md) · 이전: [제어 흐름](07-interpreter-control-flow.md) · 다음: [배열과 대입](09-arrays-assignment.md)

## 1. 이 개념이 왜 필요한가

함수 본문 코드만 저장하면 호출 당시 어떤 변수들을 읽어야 하는지 알 수 없다. 특히 함수를 반환한 뒤에도 이전 지역 변수를 사용하려면 코드와 환경의 연결을 유지해야 한다. 이 장에서는 함수 값, 호출 frame, 캡처 환경을 서로 다른 객체로 구분한다.

## 2. 일반적인 CS 개념

First-class function은 함수를 변수에 저장하거나 인수·반환값으로 사용할 수 있다는 뜻이다. Closure는 함수 코드와 그 코드가 접근할 환경의 조합이다. Call frame은 한 번의 호출에 필요한 매개변수·지역 상태다. 재귀는 같은 함수를 여러 번 활성화할 수 있지만 각 호출의 지역 상태는 분리하는 실행이다.

Closure capture는 언어에 따라 값 복사나 공유 위치 참조가 될 수 있다. 참조를 유지하는 환경은 함수 호출이 끝나도 살아 있을 수 있다.

## 3. Mini-Lang에서는 어떻게 설계했는가

UserFunction은 name, declaration AST, closure Environment, arity를 가진다. prepare가 함수 객체를 만들 때 현재 env를 closure로 저장한다. 호출 시 새 frame의 부모는 callee.closure다. 호출자 환경은 인수를 평가할 때 사용하며, 함수 본문의 이름 검색 부모가 되지 않는다.

호출 순서는 callee 평가 → callable 검사 → arity 검사 → 인수 좌→우 평가 → builtin 호출 또는 user depth 검사·frame 생성이다. user 호출은 매개변수 cell을 초기화하고 같은 frame에 body 직접 선언을 준비한다. 반환이 없거나 bare return이면 NULL이다. Builtin은 user callDepth를 증가시키지 않는다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [runtime-values.ts](../../src/runtime-values.ts): UserFunction, Builtin, Arity.
- [interpreter.ts](../../src/interpreter.ts): prepare의 함수 객체 생성, evaluate의 Call 분기.
- [environment.ts](../../src/environment.ts): parent와 cell 검색.
- [functions.test.ts](../../tests/functions.test.ts): T-CLOS, T-SCOPE, T-REC, T-RET, T-CALL.
- [09-closure-counter.lang](../../examples/09-closure-counter.lang), [10-nested-closures.lang](../../examples/10-nested-closures.lang).

가장 중요한 실제 한 줄:

```ts
const frame = new Environment(callee.closure);
```

frame이 callee.closure와 같은 객체라는 뜻은 아니다. 새 객체의 parent가 그 환경이다.

여기서 frame은 heap의 Environment 객체를 뜻한다. JavaScript의 함수 실행 기록인 call-stack frame과 다르다. Mini-Lang 호출 하나도 evaluate → guard → callback → list/statement 등의 여러 JS 호출을 사용한다. 그래서 언어 호출 깊이와 평가 깊이를 따로 제한하며, Environment는 호출 스택에서 빠져나온 뒤에도 closure 참조로 생존할 수 있다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
fn make(n){
  fn inc(){n=n+1;return n;}
  return inc;
}
let a=make(0);
let b=make(10);
print(a(),a(),b());
```

make(0)의 frame을 F0, make(10)의 frame을 F10이라고 부르자. 둘은 서로 다른 n cell을 가진다. 각 호출의 prepare는 새 inc 객체를 만들고 해당 frame을 캡처한다.

```text
global.a → inc 객체 A → closure F0(n=0)
global.b → inc 객체 B → closure F10(n=10)
A 호출 frame → F0 → global → builtins
```

a()는 새 호출 frame에서 n을 찾다가 F0의 cell을 만나 1로 바꾼다. 다음 a()는 같은 cell을 2로 바꾼다. b()는 F10만 바꾼다.

```text
1 2 11
```

호출이 끝난 F0/F10은 반환된 함수가 참조하므로 계속 접근 가능하다. 별도 GC를 구현하지 않고 호스트 JavaScript의 GC에 맡긴다.

재귀도 특별한 자기호출 명령이 없다. 함수 이름을 환경에서 찾아 일반 Call로 실행한다. 함수 binding이 mutable하므로 이름을 재대입하면 그 이름을 통한 이후 호출 대상도 바뀐다.

재귀의 frame을 보는 별도 예제:

```mini-lang
fn fact(n){
  if(n==0){return 1;}
  return n*fact(n-1);
}
print(fact(3));
```

| 진입 | 각 frame의 n | 아직 완료하지 못한 계산 |
|---|---|---|
| fact(3) | 3 | 3 * fact(2) |
| fact(2) | 2 | 2 * fact(1) |
| fact(1) | 1 | 1 * fact(0) |
| fact(0) | 0 | return 1 |

각 frame의 parent는 이전 호출 frame이 아니라 fact의 선언 환경인 global이다. 실행 중 호출은 겹쳐 있어도 lexical parent chain과 호출 순서는 다르다. fact(0)의 1이 돌아오면 fact(1)은 1, fact(2)는 2, fact(3)은 6을 반환한다. 이 시점의 최대 활성 user 호출 수는 4다.

```text
6
```

이것은 전체 호출 횟수와 최대 활성 깊이가 같은 단순 사례다. 두 갈래 재귀에서는 전체 호출 수가 훨씬 커도 깊이는 경로 길이로 정해진다. 재귀를 설명할 때 종료 조건과 다음 호출에서 줄어드는 값을 함께 확인한다.

## 6. 흔히 헷갈리는 부분

호출 실패의 종류에 따라 인수의 부수 효과도 다르다. callable/arity 검사는 인수 평가 전이지만, user callDepth 검사는 모든 인수 평가 후다. 따라서 65번째 user 호출이 거절되어도 그 호출의 인수에서 일어난 변경은 남는다. 이후 frame 생성과 body 실행만 생략된다. 다음은 ADV-06을 학습용으로 정리한 독립 오류 예제다.

```mini-lang
let seen=0;
fn f(n){
  if(n==0){return 0;}
  return f(n-1+(seen=seen+1)*0);
}
f(64);
```

f(64)부터 f(1)까지 64개가 활성화된다. f(0)의 인수를 계산하면서 seen은 64가 되지만 진입은 E_CALL_DEPTH로 거절된다. stdout은 비어 있고 기존 Session의 seen cell은 64로 남는다. 같은 세션에서 이후 `print(seen);`을 실행하면 64가 출력된다. 각 인수의 증가분은 *0으로 n 값에 영향을 주지 않는다. 정상 실행의 종료 조건도 있어 guard가 없더라도 무한 재귀를 만드는 fixture는 아니다.

선언 환경을 캡처하는 것은 값을 얼려 두는 것이 아니다. 같은 factory 호출에서 만든 sibling 함수는 cell을 공유하고 다른 factory 호출은 독립이다. 인수의 배열 객체는 공유되지만 매개변수 이름을 새 배열로 재대입하는 것은 호출자 변수의 binding을 바꾸지 않는다. 익명 함수식은 없지만 이름 있는 함수를 반환할 수 있다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

Environment 참조 capture는 mutation과 재귀를 자연스럽게 표현한다. 값 snapshot capture는 상태 공유 의미를 바꾸므로 현재 규칙의 단순 최적화가 아니다. 별도 upvalue 구조는 VM에 적합할 수 있지만 현재 tree-walk 구현에는 복잡성이 늘어난다. Tail-call 최적화는 구현하지 않았다. 꼬리 위치의 재귀도 호출 깊이를 사용한다.

메모리 비용도 있다. closure는 실제로 읽는 변수만 골라 캡처하지 않고 선언 Environment 전체와 parent chain을 붙잡는다. 그 안의 다른 cell이 큰 배열을 가리키면 closure가 배열을 사용하지 않아도 그 참조 경로 때문에 배열이 살아 있을 수 있다. 이는 “참조가 유지되는 동안의 보존 범위”이지 항상 영구적인 메모리 누수라는 뜻은 아니다. 필요한 공유 cell만 upvalue로 추출하는 대안은 보존 범위를 줄일 수 있지만 자유 변수 분석과 capture 표현이 추가로 필요하다.

## 8. 반드시 기억할 핵심 3~5개

- 함수 값과 호출 frame은 다른 객체다.
- 새 frame의 부모는 선언 환경이다.
- 클로저는 같은 cell의 이후 변경을 본다.
- arity 검사는 인수 평가보다 먼저다.
- 재귀도 일반 이름 검색과 호출을 사용한다.

## 9. 확인 문제

1. fn f(x){} 뒤 f(print(1),print(2));는 무엇을 출력하는가?
2. global x=1을 읽는 f를 local x=2가 있는 g에서 호출하면 f는 어느 x를 읽는가?
3. make가 끝났다는 이유만으로 n이 사라지는가?

<details>
<summary>해설</summary>

1. 아무것도 출력하지 않고 E_ARITY다.
2. f의 선언 환경 쪽 x=1이다.
3. 아니다. 반환된 closure가 frame을 참조한다.
</details>

## 10. 내 말로 설명해볼 질문

- a와 b의 상태가 독립인 이유를 객체와 parent 화살표로 설명해보자.
- lexical scope를 dynamic scope와 비교하되 현재 구현의 한 줄을 근거로 설명해보자.
