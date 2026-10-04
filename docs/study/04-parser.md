# 04 Recursive Descent Parser

[학습 목차](README.md) · 이전: [AST](03-ast.md) · 다음: [RuntimeValue](05-runtime-values.md)

## 1. 이 개념이 왜 필요한가

같은 토큰도 어떻게 묶느냐에 따라 결과가 달라진다. Parser는 올바른 구문을 인정하고 구조를 확정한다. 계산 결과만 외우지 않고 함수 호출 관계를 읽으면 우선순위와 결합 방향을 직접 설명할 수 있다.

## 2. 일반적인 CS 개념

Recursive descent는 문법 규칙을 서로 호출하는 함수로 구현하는 방식이다. Precedence는 서로 다른 연산자의 묶이는 강도이고 associativity는 같은 단계 연산자의 묶이는 방향이다. 문법적으로 가능한 구조와 실행 시 가능한 타입은 다르다. Parser가 모든 의미 오류를 알아내는 것은 아니다.

왼쪽 재귀 문법을 그대로 함수 재귀로 옮기면 입력을 소비하기 전에 재귀할 수 있다. 이항 연산 반복문은 그런 문제를 피하면서 왼쪽 결합 트리를 만든다.

## 3. Mini-Lang에서는 어떻게 설계했는가

낮은 우선순위에서 높은 순서로 assignment → or → and → equality → comparison → term → factor → unary → postfix → primary를 사용한다. 일반 binary는 반복문, assignment RHS와 unary operand는 재귀다. Postfix는 호출과 index를 반복해서 감싼다.

문장 영역은 declaration, block, statement, ifStatement로 나뉜다. Parser의 scope Set은 중복 이름 검사용이고 functionDepth는 함수 밖 return 검사용이다. 실제 값이나 closure는 없다. 이름 미정의 여부는 실행할 때 확인한다.

대입은 처음부터 변수 전용 문법으로 갈라 읽지 않는다. assignment의 `const target = this.or()`가 왼쪽을 일반 logicalOr 식으로 먼저 만든다. 뒤에 '='가 없으면 그 식을 반환하고, 있으면 kind가 Identifier 또는 Index인지 검사한다. 유효할 때만 RHS를 재귀 파싱한다. GRAMMAR의 넓은 구문 규칙에 대입 대상이라는 정적 제약을 덧붙이는 전략이다. 그래서 `1+2 =`는 오른쪽이 없어도 '=' 위치의 E_ASSIGN_TARGET으로 즉시 invalid다. 단순히 다음 토큰 하나로 모든 구문을 미리 구분한다고 설명하면 이 과정을 놓친다.

registerName도 전체 소스 완성을 기다리지 않는다. 선언 이름을 읽자마자 등록하므로 `let x=1;let x=`는 두 번째 x에서 E_DUPLICATE로 invalid다. 매개변수는 별도 Set에서 중복 검사한 뒤 block(params)의 scope Set 초기값이 된다. 매개변수와 함수 본문 최상위 선언은 충돌하지만, 함수 이름은 바깥 scope에 있으므로 `fn f(f){return f;}`처럼 매개변수가 함수 이름을 가리는 것은 허용된다.

## 4. 실제 저장소의 파일 / 함수 / 타입

[parser.ts](../../src/parser.ts)의 핵심 연결:

```ts
private term(): Expr {
  return this.binary(() => this.factor(), ['+','-']);
}
```

term이 피연산자를 factor에 맡겨 곱셈을 먼저 구조화한다. assignment는 왼쪽이 Identifier/Index인지 확인한 뒤 assignment를 다시 호출해 RHS를 만든다. postfix는 기존 expression을 Call 또는 Index로 감싼다.

읽기 순서: parse → program → declaration/statement → expression → assignment → binary → postfix → primary. [GRAMMAR](../../GRAMMAR.md)의 E2/E3와 [parser-expression.test.ts](../../tests/parser-expression.test.ts), [parser-statement.test.ts](../../tests/parser-statement.test.ts)를 대조한다. advance는 EOF에서 cursor를 증가시키지 않는다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
let a=0;
let b=0;
a=b=1+2*3;
print(a,b,10-3-2);
```

1. assignment가 a를 읽고 '='를 발견한다.
2. RHS를 assignment로 읽어 b=(1+2*3)을 만든다.
3. term 안에서 factor가 2*3을 먼저 묶는다.
4. AST는 Assign(a, Assign(b, Binary(+,1,Binary(*,2,3))))가 된다.
5. 실행하면 b에 7, a에 7을 저장한다.
6. 10-3-2는 binary 반복문 때문에 (10-3)-2다.

```text
7 7 5
```

추가로 `f(1)[0](2)`는 `Call(Index(Call(f,1),0),2)`로 묶인다. 이는 구문 설명이며 실제 성공하려면 각 중간 값이 다음 연산의 요구 타입이어야 한다.

## 6. 흔히 헷갈리는 부분

1<2<3은 구문 오류가 아니다. (1<2)<3으로 파싱하고 boolean과 number 비교에서 TypeError가 난다. f(1,)은 trailing comma를 허용하지 않아 오류다. ++x는 증가 연산이 아니라 unary + 두 번이다. if/while 본문에는 중괄호가 필요하다.

Parser 생성자에 EOF 없는 위조 Token 배열을 전달하면 내부 계약 오류가 난다. 이것을 정상 소스 입력이 LangSyntaxError 대신 host 오류를 낸 사례와 혼동하지 않는다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

고정된 작은 연산자 집합에서는 문법과 함수의 대응이 명확한 recursive descent를 선택했다. Pratt나 precedence climbing은 연산자 확장에 유리할 수 있지만 binding power와 경계값을 별도로 이해해야 한다. 현재 parser는 첫 오류에서 중단한다. 여러 오류를 모으는 panic-mode recovery는 편집기에는 유용하나 복구 지점과 가짜 AST 처리 정책이 추가로 필요하다.

## 8. 반드시 기억할 핵심 3~5개

- 우선순위는 함수 계층으로 표현한다.
- 일반 binary는 왼쪽 결합, 대입은 오른쪽 결합이다.
- 호출과 index는 반복 postfix 체인이다.
- 중복 선언·return 문맥·대입 대상도 parser가 검사한다.
- 파싱 성공이 실행 성공을 보장하지 않는다.

## 9. 확인 문제

1. a=b=3의 가장 바깥 Assign 대상은?
2. 함수 밖 블록 안의 return은 허용되는가?
3. f()[0]의 가장 바깥 노드는 무엇인가?

<details>
<summary>해설</summary>

1. a다. RHS가 b=3이다.
2. 아니다. 블록은 함수 문맥을 만들지 않는다.
3. Index다. f()의 결과를 base로 사용한다.
</details>

## 10. 내 말로 설명해볼 질문

- binary의 반복문과 assignment의 재귀가 서로 다른 결합 방향을 만드는 과정을 설명해보자.
- Parser의 scope Set과 실행 중 Environment가 왜 다른 구조인지 설명해보자.
