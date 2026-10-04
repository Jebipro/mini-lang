# 05 RuntimeValue와 연산 의미론

[학습 목차](README.md) · 이전: [Parser](04-parser.md) · 다음: [Environment](06-environment-scope.md)

## 1. 이 개념이 왜 필요한가

호스트 언어가 JavaScript라고 해서 그 truthiness나 타입 변환을 그대로 사용하면 Mini-Lang의 명세가 달라진다. 실행 값을 명확히 표현하고 연산 규칙을 한곳에서 확인해야 언어 자체의 동작을 설명할 수 있다.

## 2. 일반적인 CS 개념

동적 타입 언어도 실행 시 값의 종류를 구분한다. Tagged value는 값에 종류 표식을 붙인다. Equality는 내용 비교와 객체 identity 비교로 나뉠 수 있다. Truthiness는 조건문이 값을 참·거짓으로 해석하는 규칙이고, 논리 연산의 반환 타입과는 별개다. 부동소수점은 실수의 근사 표현이므로 모든 십진수를 정확히 표현하지 못한다.

## 3. Mini-Lang에서는 어떻게 설계했는가

RuntimeValue의 tag는 number, string, boolean, null, array, user-function, builtin이다. undefined는 언어 값이 아니다. 숫자는 finite binary64이며 비유한 literal은 구문 오류, 연산 결과의 비유한 숫자는 런타임 오류다.

Mini-Lang은 동적 타입 언어다. 변수에 선언된 고정 타입을 검사하지 않고 실행할 때 값의 tag로 연산 가능 여부를 판단한다. `let x=1;x="a";`는 허용하지만 `1+"a"`는 타입 오류다. 따라서 동적 타입과 암묵 변환 허용은 다른 축이다. 여기서는 모호한 “강한 타입”이라는 표현만 쓰기보다 **동적 타입이며 연산의 암묵적 타입 변환이 없다**고 설명하는 것이 정확하다. TypeScript의 정적 검사는 Mini-Lang 소스가 아닌 interpreter 구현을 대상으로 한다.

NULL은 `{tag:'null'}`로 한 번 만든 공통 객체다. primitive(null), bare return, 반환 없는 함수와 print는 이를 사용한다. 다만 null의 언어 equality는 객체 주소가 아니라 tag를 검사하므로 singleton 구현 선택과 동등성 규칙을 구분한다.

false와 null만 falsy다. +는 number끼리 또는 string끼리만, 관계 비교는 number끼리만 가능하다. 다른 타입의 equality는 false다. 배열과 함수는 객체 identity로 비교한다. &&와 ||는 boolean으로 강제 변환한 값이 아니라 선택된 피연산자를 반환한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [runtime-values.ts](../../src/runtime-values.ts): RuntimeValue, primitive, NULL, truthy, equal, binary, typeName.
- [interpreter.ts](../../src/interpreter.ts): Unary, Binary, Logical 분기. Logical은 단락 평가 때문에 binary helper로 보내지 않는다.
- [builtins.ts](../../src/builtins.ts): createBuiltins, print/len의 invoke.
- [value-format.ts](../../src/value-format.ts): formatValue, 내부 display.
- [values.test.ts](../../tests/values.test.ts), [builtins.test.ts](../../tests/builtins.test.ts): 의미와 표시 검증.

실제 truthiness 판정:

```ts
return value.tag !== 'null'
  && !(value.tag === 'boolean' && !value.value);
```

Primitive wrapper 객체가 서로 달라도 숫자는 payload로 비교한다. 모든 값에 단순 객체 ===를 적용하지 않는다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
print(0 && 9, null || 7, !0);
print("a"+"b", 1=="1", -5%2);
print(len("😀"));
```

0은 truthy이므로 &&는 오른쪽 9를 평가·반환한다. null은 falsy이므로 ||는 7을 반환한다. !0은 false다. 문자열끼리 +는 연결이고 다른 tag의 equality는 false다. %는 바닥 나눗셈 기반 modulo가 아닌 truncate-toward-zero remainder다. 문자열 길이는 UTF-16 code unit 수다.

```text
9 7 false
ab false -1
2
```

print는 인수를 formatValue로 바꿔 공백 하나로 연결하고 LF 하나를 출력한 뒤 NULL을 반환한다. len은 한 인수만 받고 배열 길이 또는 문자열 길이를 숫자로 반환한다.

숫자 실패는 아래 세 경우로 나눈다. 각 입력은 독립 실행한다.

| 입력 | 결과 | 검사 시점 |
|---|---|---|
| `1/0;`, `0/0;`, `1%0;` | RuntimeError / E_ZERO_DIVISION | 실제 나눗셈·나머지 계산 전에 분모 0 검사 |
| 유한한 큰 수의 곱셈 overflow | RuntimeError / E_NONFINITE | 연산 후 Number.isFinite 검사 |
| literal 자체가 유한하지 않음 | SyntaxError / E_NUMBER | lexer가 숫자를 변환한 직후 |

따라서 0/0을 NaN 결과의 E_NONFINITE로 설명하면 틀린다. Overflow의 재현 입력은 호스트에서 `'1' + '0'.repeat(308) + '*10;'`으로 만들 수 있다. Mini-Lang에는 309자리 십진수와 *10이 전달된다. `1e308*10;`은 이 언어가 지수 표기를 지원하지 않아 e 위치의 E_NUMBER가 먼저 발생하므로 overflow 예제로 쓰지 않는다.

## 6. 흔히 헷갈리는 부분

0과 빈 문자열도 truthy다. 1+"1"은 문자열 연결이 아니다. -0은 숫자로 존재할 수 있지만 표시하면 0이며 +0과 동등하다. print의 최상위 문자열은 따옴표가 없고 배열 안 문자열은 JSON 방식으로 quote/escape된다. len이 2라고 이모지가 눈에 보이는 두 글자라는 뜻은 아니다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

Tagged union은 분기가 명시적이며 호스트 undefined·coercion 유입을 줄인다. 호스트 값을 직접 쓰면 코드가 짧아질 수 있지만 값 검증과 언어/호스트 타입 구별이 더 어려워진다. 문자열 길이를 grapheme 기준으로 정하는 대안은 사용자 기대에 가까울 수 있지만 Unicode segmentation 규칙이 필요하다. 현재는 UTF-16 계약을 따른다.

## 8. 반드시 기억할 핵심 3~5개

- 실행 값은 tag로 구분한다.
- 암묵적 숫자·문자 변환이 없다.
- false/null만 falsy다.
- primitive는 값 비교, 배열·함수는 identity 비교다.
- 표시 형식과 내부 값은 다르다.

## 9. 확인 문제

1. []==[]의 결과는?
2. "" || 7의 결과는?
3. 1/0과 숫자 literal overflow의 오류 계열은 같은가?

<details>
<summary>해설</summary>

1. 서로 다른 배열 객체이므로 false.
2. 빈 문자열은 truthy이므로 빈 문자열 자체.
3. 전자는 RuntimeError, 후자는 SyntaxError다.
</details>

## 10. 내 말로 설명해볼 질문

- JavaScript로 구현했는데도 JavaScript와 다른 조건 판정이 가능한 이유를 설명해보자.
- equality와 formatValue가 서로 다른 책임인 이유를 예제로 설명해보자.
