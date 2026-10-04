# 07 Interpreter / Evaluation / Control Flow

[학습 목차](README.md) · 이전: [Environment](06-environment-scope.md) · 다음: [함수와 클로저](08-functions-closures.md)

## 1. 이 개념이 왜 필요한가

계산식 하나를 평가하는 것과 문장 목록을 실행하는 것은 다르다. 특히 return을 만났을 때 단순히 값을 계산하고 다음 문장으로 넘어가면 잘못된 동작이 된다. 이 장에서는 값 흐름과 제어 흐름을 나누어 읽는다.

## 2. 일반적인 CS 개념

Evaluation은 표현식에서 값을 얻는 과정이다. Control flow는 어떤 문장을 다음에 실행할지 결정한다. Completion record는 정상 진행인지 반환 같은 제어 이동인지 데이터로 나타내는 방법이다. 오류 예외와 정상적인 함수 반환은 서로 다른 사건이다.

단락 평가는 연산 결과를 결정하는 데 필요하지 않은 피연산자를 실행하지 않는다. 부수 효과가 있는 언어에서는 이것이 최종 값만큼 중요한 규칙이다.

일반적인 completion 모델은 return 외에 throw, break, continue 같은 제어 이동까지 포함할 수 있다. 여기서 그 전체 모델을 구현한다고 이해하면 안 된다. Mini-Lang의 실제 Completion 범위는 다음 절의 두 종류뿐이다.

## 3. Mini-Lang에서는 어떻게 설계했는가

evaluate는 RuntimeValue를 반환하고 statement/list는 Completion을 반환한다. Completion은 normal 또는 return(value)다. execute는 prepare 후 list를 실행한다. Block은 자식 환경에서 준비·실행하고, If는 선택한 분기의 completion을 전달한다. While은 body가 return이면 즉시 같은 결과를 위로 전달한다.

오류는 Completion의 throw variant가 아니라 LangError 계열 예외로 전달한다. break/continue 제어문은 문법에 없다. 따라서 이 프로젝트의 Completion을 일반적인 모든 종료 상태의 집합으로 설명하지 않는다.

Expression 문장은 값 계산 후 전달받은 echo가 있으면 호출한다. 블록과 함수 body의 list에는 최상위 echo를 넘기지 않는다. 일반 binary는 좌·우를 평가한 뒤 타입을 검사하지만 Logical은 왼쪽만으로 결정되면 오른쪽을 생략한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

[interpreter.ts](../../src/interpreter.ts):

```ts
type Completion =
  | { readonly kind: 'normal' }
  | { readonly kind: 'return'; readonly value: RuntimeValue };
```

list의 핵심은 statement 결과가 return이면 즉시 반환하는 것이다. Call 분기에서는 함수 body의 return을 RuntimeValue로 소비한다. 오류는 LangError 계열 throw로 전달한다. [interpreter.test.ts](../../tests/interpreter.test.ts)와 [functions.test.ts](../../tests/functions.test.ts)의 T-RET 계열을 함께 읽는다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
fn pick(){
  let i=0;
  while(i<3){
    i=i+1;
    if(i==2){return i;}
  }
  return 9;
}
print(pick());
```

1. Program 준비 때 pick 함수가 초기화된다.
2. 호출 frame에서 i를 예약하고 0으로 초기화한다.
3. 첫 반복에서 직접 선언이 없는 빈 block 환경이 생긴다. i=i+1은 parent인 호출 frame까지 검색해 그곳의 i cell을 1로 바꾼다. if는 false, completion은 normal이다.
4. 두 번째 반복에도 별도의 빈 block 환경이 생기지만 같은 호출 frame의 i cell을 찾아 2로 바꾼다. i가 반복마다 새로 선언되는 것은 아니다.
5. Return 문장이 return(number 2)를 만든다.
6. 아래 표의 안쪽 실행 경계부터 반환 상태가 차례로 전파된다.
7. Call이 반환 상태에서 숫자 2를 꺼내 결과로 삼는다. return 9는 실행되지 않는다.

| 순서 | 실제 코드 경계 | 하는 일 |
|---|---|---|
| 1 | statement의 Return | return(number 2) 생성 |
| 2 | then 블록의 list | Return 결과를 만나 즉시 반환 |
| 3 | statement의 then Block | list 결과를 그대로 반환 |
| 4 | statement의 If | 선택한 then Block 결과 반환 |
| 5 | while 본문 list → statement의 Block | 반환 상태를 그대로 전달 |
| 6 | statement의 While | return임을 확인하고 반복을 끝내며 반환 |
| 7 | 함수 본문의 list | 다음 문장을 실행하지 않고 반환 |
| 8 | evaluate의 Call | Completion에서 value를 꺼내 호출 결과로 소비 |

본문 블록 자체에 let을 선언했다면 그 이름은 반복마다 새 cell을 가진다. 이 예제의 i는 블록 밖에 있으므로 해당하지 않는다.

```text
2
```

깊이 guard는 statement와 evaluate 진입을 감싸며 예외가 나도 finally에서 카운터를 복구한다. 반복 횟수 전체가 카운터에 누적되는 것은 아니다.

## 6. 흔히 헷갈리는 부분

return은 LangRuntimeError가 아니다. 안쪽 함수의 return이 바깥 함수까지 직접 빠져나가지 않는다. 안쪽 Call에서 소비되기 때문이다. if는 반드시 boolean만 받지 않고 truthy 규칙을 적용한다. 조건이 거짓인 분기는 평가하지 않지만 그 코드도 전체 파싱 단계에서는 문법 검사를 받는다.

null+print(1)은 오른쪽 print까지 실행하고 타입 오류가 난다. 반면 false&&print(1)은 오른쪽을 실행하지 않는다. 양쪽 모두 오류 방지를 위한 무조건 단락 평가라고 생각하면 안 된다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

명시적 Completion은 모든 제어 경계가 반환을 전달해야 하므로 코드가 늘지만 정상 제어 흐름이 타입에 드러난다. 특별한 Return 예외를 던지는 대안은 전파가 짧아지지만 오류 catch와 구분해야 한다. Interpreter에 mutable currentEnv를 두는 대신 env를 인수로 전달해 호출·블록의 환경 복원 문제를 줄였다.

## 8. 반드시 기억할 핵심 3~5개

- evaluate는 값, statement는 completion을 반환한다.
- return은 블록·if·while을 지나 함수 호출 경계에서 소비된다.
- 일반 binary와 Logical은 평가 전략이 다르다.
- 실행하지 않는 분기도 문법적으로 유효해야 한다.

## 9. 확인 문제

1. 함수가 return 없이 끝나면 호출 값은?
2. false&&missing은 undefined 오류가 나는가?
3. return 뒤의 문장을 list가 실행하는가?

<details>
<summary>해설</summary>

1. NULL이다.
2. 아니다. false를 그대로 반환한다.
3. 아니다. return completion을 만나면 즉시 위로 전달한다.
</details>

## 10. 내 말로 설명해볼 질문

- 예제에서 return 2가 통과하는 실행 경계를 순서대로 설명해보자.
- 값의 최종 결과가 같아도 평가 순서를 명세로 정해야 하는 이유를 설명해보자.
