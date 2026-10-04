# 09 Array / Reference / Assignment Evaluation Order

[학습 목차](README.md) · 이전: [함수](08-functions-closures.md) · 다음: [오류와 제한](10-errors-limits.md)

## 1. 이 개념이 왜 필요한가

배열을 두 변수에 넣으면 복사인지 공유인지부터 결정해야 한다. 대입의 오른쪽이 함수를 호출하거나 같은 변수를 재대입하면 왼쪽을 언제 계산했는지가 결과를 바꾼다. 단순한 a[0]=1도 실행 순서의 계약을 가진다.

## 2. 일반적인 CS 개념

Value는 읽은 값이고 reference는 쓸 위치를 나타낸다. Aliasing은 여러 경로가 같은 객체를 가리키는 현상이다. 변수 재바인딩은 이름이 다른 값을 가리키게 하는 것이고 객체 mutation은 기존 객체 내부를 바꾸는 것이다. L-value라는 용어는 저장 대상으로 쓸 수 있는 구문을 설명할 때 사용한다.

## 3. Mini-Lang에서는 어떻게 설계했는가

배열은 tag와 mutable elements를 가진 객체이며 literal을 평가할 때마다 새로 만든다. 요소 타입은 섞일 수 있다. 언어에서 길이 변경은 지원하지 않고 기존 index만 읽고 쓴다. Index는 array에만 가능하고 정수 number 및 0 이상 length 미만을 요구한다. -0은 0으로 취급한다.

대입은 왼쪽 reference를 검증·확정한 뒤 RHS를 평가하고 확정한 위치에 저장한다. Identifier는 cell, Index는 {array,index}를 기억한다. base가 배열이 아니면 index도 평가하지 않는다. index가 잘못되면 RHS는 평가하지 않는다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [runtime-values.ts](../../src/runtime-values.ts): ArrayValue.
- [parser.ts](../../src/parser.ts): assignment의 Identifier/Index 제한.
- [interpreter.ts](../../src/interpreter.ts): Assign, Array, Index, indexReference.
- [value-format.ts](../../src/value-format.ts): 배열 출력의 active Set.
- [arrays.test.ts](../../tests/arrays.test.ts): T-ASG-3/4, T-IDX.
- [adversarial.test.ts](../../tests/adversarial.test.ts): ADV-04/05.
- [blind-review.test.ts](../../tests/blind-review.test.ts): BRC-06 식별자 target 선검증.

실제 배열 대입 부분:

```ts
const {array,index} = this.indexReference(expr.target,env);
const value = this.evaluate(expr.value,env);
array.elements[index] = value;
return value;
```

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
let a=[0];
let old=a;
a[0]=(a=[9]);
print(old,a,old[0]==a);
```

| 시점 | a | old | 기존 배열 A의 0번 |
|---|---|---|---|
| 두 선언 후 | A | A | 숫자 0 |
| target 계산 | A | A | 저장 위치 (A,0) 확보 |
| RHS a=[9] | 새 배열 B | A | 아직 0 |
| 최종 저장 | B | A | B 참조 |

RHS 대입은 저장한 값 B 자체를 반환하므로 기존 A의 요소가 B가 된다. 출력:

```text
[[9]] [9] true
```

아래는 별도로 실행할 의도적인 오류 예제다.

```mini-lang
let a=[1];
a[1]=print(99);
```

length가 1이므로 index 1은 E_INDEX_RANGE다. stdout은 비어 있고 print(99)는 실행되지 않는다.

## 6. 흔히 헷갈리는 부분

a=b는 배열 복사가 아니다. readonly elements 필드 선언은 요소 변경까지 금지하는 뜻이 아니다. 문자열도 길이는 있지만 index 연산은 지원하지 않는다. a[len(a)]=x로 append할 수 없다.

순환 배열은 허용한다. formatter는 현재 경로의 재방문만 `<cycle>`로 표시한다. 같은 하위 배열을 형제 위치에서 두 번 출력하는 것은 순환이 아니다. 출력 깊이 제한도 값 자체를 자르거나 변경하지 않는다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

참조 공유는 클로저 반환 배열과 mutation을 단순하게 연결한다. Copy-on-write나 불변 배열은 다른 비용과 mutation 규칙을 가진 대안이다. 범위 초과 자동 확장은 편리할 수 있지만 hole·length·오류 규칙이 달라진다. RHS 선평가도 가능한 언어 설계지만 현재 계약에서는 부수 효과와 오류 우선순위를 바꾸므로 허용되는 리팩터링이 아니다.

## 8. 반드시 기억할 핵심 3~5개

- 배열 대입은 기본적으로 객체 참조 공유다.
- 재바인딩과 mutation을 구분한다.
- 대입 target을 먼저 검증하고 한 번만 계산한다.
- 범위 초과 접근·쓰기는 오류이며 자동 확장이 없다.
- 배열 equality는 깊은 비교가 아니다.

## 9. 확인 문제

1. 1[print(99)]는 99를 출력하는가?
2. let a=[0]; let b=a; b[0]=7; 뒤 a[0]은?
3. missing=print(1);에서 print는 실행되는가?

<details>
<summary>해설</summary>

1. 아니다. base 타입 검사에서 E_INDEX_BASE다.
2. 같은 객체이므로 7이다.
3. 아니다. 식별자 target 검색에서 E_UNDEFINED다.
</details>

## 10. 내 말로 설명해볼 질문

- 예제에서 old와 a가 달라지는 순간과 old[0]이 바뀌는 순간을 나누어 설명해보자.
- 대입 순서를 바꿨을 때 최종 숫자가 같아도 버그가 될 수 있는 이유를 설명해보자.
