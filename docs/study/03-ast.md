# 03 AST

[학습 목차](README.md) · 이전: [Lexer](02-source-token-lexer.md) · 다음: [Parser](04-parser.md)

## 1. 이 개념이 왜 필요한가

토큰 목록은 순서만 나타낸다. 1+2*3에서 곱셈이 덧셈의 오른쪽 계산이라는 관계를 표현하려면 계층 구조가 필요하다. AST를 이해하면 parser가 무엇을 만들고 interpreter가 무엇을 읽는지 연결할 수 있다.

## 2. 일반적인 CS 개념

Abstract Syntax Tree는 프로그램의 핵심 구문 관계를 트리로 표현한다. 구분자와 공백을 모두 보관하는 concrete syntax tree와 다르다. Expression은 값을 계산하고 statement는 실행 순서를 구성한다. Tagged/discriminated union은 kind 같은 구별 필드에 따라 필요한 데이터 필드가 달라지는 타입 표현이다.

AST를 얼마나 단순화할지는 언어마다 다르다. 모든 괄호를 반드시 제거해야 하는 것은 아니다.

## 3. Mini-Lang에서는 어떻게 설계했는가

AST는 클래스 계층이 아닌 TypeScript union이다. 공통 NodeBase에 span과 height가 있다. Expr은 Literal, Identifier, Group, Unary, Binary, Logical, Assign, Array, Index, Call이다. Stmt는 Let, Function, Block, Expression, If, While, Return이며 Program은 문장 목록이다.

Group을 보존하므로 괄호로 감싼 변수 자체를 대입 대상으로 허용하지 않는 규칙을 구분할 수 있다. Binary와 Logical은 모양이 비슷하지만 실행 방식이 다르다. 각 노드에는 evaluate 메서드가 없다. 실행은 Interpreter가 담당한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

[ast.ts](../../src/ast.ts)의 작은 핵심:

```ts
export interface NodeBase {
  readonly span: Span;
  readonly height: number
}
```

읽기 전용은 TypeScript 타입 계약이다. Object.freeze로 모든 객체를 런타임에 동결한다는 뜻은 아니다.

[parser.ts](../../src/parser.ts)의 node는 자식 height의 최댓값에 1을 더하고 span을 결합한다. [interpreter.ts](../../src/interpreter.ts)의 evaluate와 statement는 kind로 분기한다. [errors.ts](../../src/errors.ts)의 unreachable(never)은 처리 누락을 타입 검사로 드러내는 장치다. [parser-expression.test.ts](../../tests/parser-expression.test.ts)에서 AST 모양을 확인한다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
print(1 + 2 * 3);
```

위치 정보를 생략한 구조:

```text
Program
└─ Expression
   └─ Call
      ├─ callee: Identifier(print)
      └─ args[0]: Binary(+)
         ├─ left: Literal(1)
         └─ right: Binary(*)
            ├─ Literal(2)
            └─ Literal(3)
```

Literal의 height는 1, 곱셈은 2, 덧셈은 3, Call은 4, Expression은 5, Program은 6이다. Interpreter가 트리를 읽어 2*3을 6으로 만들고 1을 더해 출력한다.

```text
7
```

AST 자체의 Literal.value는 원시 데이터다. 실행하면서 primitive가 tagged RuntimeValue로 바꾼다.

## 6. 흔히 헷갈리는 부분

print(1);에서 Call은 Expr이고 이를 둘러싼 Expression은 Stmt다. 함수 선언 Function은 expression이 아니므로 익명 함수식을 작성할 수 없다. span은 전체 구문 범위이고 anchor는 연산자·괄호 등 진단 기준점이다. height는 자식 수나 토큰 수가 아닌 가장 긴 자식 경로 길이다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

Union과 switch는 이 크기의 언어에서 구조와 처리를 한눈에 연결하기 쉽다. Visitor는 실행 외 여러 pass를 추가할 때 정리하기 좋지만 방문 인터페이스가 늘어난다. node.evaluate 메서드는 객체지향적으로 보일 수 있으나 AST가 runtime과 결합한다. 현재 구현은 AST를 데이터로 두어 파싱 테스트와 실행 테스트를 분리한다.

## 8. 반드시 기억할 핵심 3~5개

- AST는 구문 데이터이며 실행 결과가 아니다.
- Expr과 Stmt는 역할이 다르다.
- Group도 현재 AST의 실제 노드다.
- kind는 분기, span/anchor는 진단, height는 안전성에 쓰인다.

## 9. 확인 문제

1. Program의 height에 Expression wrapper가 포함되는가?
2. 배열 literal AST의 elements와 ArrayValue의 elements는 같은 것인가?
3. (a)=1과 (a)[0]=1의 최외곽 대입 대상 kind는?

<details>
<summary>해설</summary>

1. 포함된다.
2. 전자는 Expr 목록, 후자는 실행한 RuntimeValue 목록이다.
3. Group과 Index다. 전자는 거절하고 후자는 문법상 허용한다. 후자의 실행 성공 여부는 a의 값과 index에 달려 있다.
</details>

## 10. 내 말로 설명해볼 질문

- AST 그림만 보고 곱셈이 먼저 필요한 이유를 설명해보자.
- 새로운 AST 종류를 추가한다고 가정할 때 parser뿐 아니라 실행 분기도 확인해야 하는 이유를 설명해보자. 실제 수정은 하지 않는다.
