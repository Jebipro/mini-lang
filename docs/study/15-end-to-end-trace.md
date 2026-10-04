# 15 전체 프로그램 실행 추적

[학습 목차](README.md) · 이전: [설계 대안](14-design-tradeoffs.md)

## 1. 이 개념이 왜 필요한가

Lexer나 closure를 따로 설명할 수 있어도 전체 프로그램에서 객체들이 언제 생기고 연결되는지는 혼동하기 쉽다. 마지막 장은 새로운 기능을 배우는 대신 앞선 개념을 한 프로그램으로 통합한다. 코드를 외우지 말고 원문·AST·환경·값의 변화를 나누어 기록한다.

## 2. 일반적인 CS 개념

Execution trace는 프로그램 실행을 관찰 가능한 작은 단계로 나눈 기록이다. Control stack은 현재 실행 중인 호출 관계이고 lexical environment chain은 이름 검색 관계다. 두 구조는 같지 않다. Heap에 남은 객체는 호출이 종료되어도 다른 참조가 있으면 계속 접근할 수 있다.

추적에서는 임의의 객체 이름 A, F 등을 붙여 identity를 구분할 수 있다. 이는 디버거의 실제 메모리 주소나 언어에 추가된 이름이 아니다.

이 교재의 F, C1, C2 같은 호출 frame은 heap의 Environment 객체다. 현재 계산을 수행하는 JavaScript call-stack frame과 구별한다. JS의 make 실행 경로가 끝나도 반환된 Mini-Lang 함수가 F를 참조하면 F는 계속 남는다. 반대로 callDepth/evaluationDepth는 현재 활성 실행을 세며 객체가 살아 있는 기간 전체를 세지 않는다.

## 3. Mini-Lang에서는 어떻게 설계했는가

아래 예제는 함수 hoisting, let 초기화, closure, 배열 alias, 대입 순서, return 전파를 연결한다. 파일 모드라 expression echo는 없고 print만 출력한다. AST는 한 번 전체 파싱한 뒤 실행하며 함수 호출 때 새 AST를 파싱하지 않는다.

이 예제에는 깊이 제한이나 오류가 발생하지 않는다. 정상 경로를 먼저 이해한 다음 일부 표현식을 바꿨을 때 어디에서 실패할지 생각한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

| 단계 | 코드 연결 |
|---|---|
| 파일 읽기 | [cli/run.ts](../../src/cli/run.ts)의 main |
| 소스·세션 생성 | [runner.ts](../../src/runner.ts)의 runScript/createSession |
| 위치·토큰 | [source-location.ts](../../src/source-location.ts)의 SourceUnit, [lexer.ts](../../src/lexer.ts)의 lex |
| AST 생성 | [parser.ts](../../src/parser.ts)의 program/declaration/postfix/assignment |
| 구조 타입 | [ast.ts](../../src/ast.ts)의 FunctionDecl/Assign/Call/Index |
| 선언·실행 | [interpreter.ts](../../src/interpreter.ts)의 prepare/list/statement/evaluate |
| 이름·캡처 | [environment.ts](../../src/environment.ts)의 reference/get, UserFunction.closure |
| 출력 | [builtins.ts](../../src/builtins.ts)의 print, [value-format.ts](../../src/value-format.ts)의 formatValue |

연결해서 읽을 기존 예제는 [09-closure-counter](../../examples/09-closure-counter.lang), [12-array-operations](../../examples/12-array-operations.lang), [15-recursion-array-sum](../../examples/15-recursion-array-sum.lang)이다. 아래 프로그램은 교재용 조합 예제이며 기존 예제 파일을 변경하지 않는다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
let step=make(1);
fn make(n){
  let box=[n];
  fn next(delta){
    box[0]=box[0]+delta;
    return box;
  }
  return next;
}
let first=step(2);
let second=step(3);
print(first,second,first==second);
```

**A. 소스와 세션**

CLI가 읽은 원문으로 SourceUnit S를 만든다. createSession은 builtin 환경 B, 그 자식 global G, Interpreter I를 만든다. Session은 G와 I를 묶는다. S는 Session 자체의 필드가 아니라 Program의 span 등을 통해 이어진다.

**B. 토큰과 AST**

lex는 let, identifier, =, call delimiter 등의 토큰과 EOF를 만든다. Parser는 최상위에 Let(step), Function(make), Let(first), Let(second), Expression(print 호출)을 둔다. make의 body에는 Let(box), Function(next), Return이 있다. next의 대입 target은 Index, RHS는 Binary다. 아직 배열 객체나 closure frame은 만들어지지 않았다.

**C. 전역 준비**

prepare는 G에 step/make/first/second를 모두 예약한다. make만 즉시 UserFunction으로 초기화하며 closure=G다. 그래서 소스에서 make 선언보다 앞에 있는 첫 let의 initializer가 make를 호출할 수 있다.

**D. make(1) 실행**

make를 평가하고 arity 1을 확인한 뒤 인수 1을 계산한다. 새 frame F의 parent는 G다. F의 n을 1로 초기화하고 box/next를 예약한다. next는 closure=F인 함수 객체 N으로 초기화한다. let box=[n]이 배열 A=[1]을 만들고 F.box에 저장한다. return next가 N을 반환하고 G.step은 N으로 초기화된다.

```text
G.step → 함수 N → closure F
F.n → 1
F.box → 배열 A [1]
F.next → 함수 N
F.parent → G → B
```

make 호출은 끝났지만 N이 F를 참조한다. F와 N 사이의 순환 참조도 호스트 GC가 처리할 대상이다.

**E. step(2) 실행**

step은 N이다. 새 호출 frame C1의 parent는 F이고 delta=2다. box[0]의 target 평가에서 F.box의 배열 A와 index 0을 확보한다. RHS는 A[0]의 1과 delta의 2를 더해 3이다. 확보한 A[0]에 3을 저장한다. return box는 복사본이 아닌 A를 반환한다. first는 A를 가리킨다.

**F. step(3) 실행**

새 C2는 C1과 별개지만 parent는 같은 F다. A[0]의 3에 delta 3을 더해 6을 저장한다. second도 A를 가리킨다. first가 예전 [3]의 snapshot을 보관한 것은 아니다.

| 시점 | A의 내용 | first | second |
|---|---|---|---|
| make 완료 | [1] | uninitialized | uninitialized |
| step(2) 완료 | [3] | A | uninitialized |
| step(3) 완료 | [6] | A | A |

**G. 출력과 종료**

print의 callee를 먼저 확정하고 인수를 왼쪽부터 평가한다. first와 second는 같은 A, equality는 true다. formatValue는 각 배열을 표시하고 print는 LF를 붙여 output callback으로 보낸다.

```text
[6] [6] true
```

각 user 호출의 finally가 callDepth를 줄이고 statement/evaluate guard도 복구한다. Program은 normal completion으로 끝나며 CLI 정상 종료 코드는 0이다.

## 6. 흔히 헷갈리는 부분

make가 호출될 때마다 함수 본문을 파싱하지 않는다. 동일 선언 AST를 사용하지만 frame과 내부 함수 객체는 호출마다 새로 만든다. next가 전역에서 호출되어도 box는 선언 환경 F에서 찾는다. first는 값이 [3]으로 고정된 복사본이 아니다. 예약된 second가 존재한다는 사실과 second를 읽을 수 있다는 사실도 다르다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

이 예제는 참조 capture와 mutable array의 조합을 관찰한다. 값 복사 반환 또는 snapshot capture라면 결과와 상태 공유가 달라질 수 있다. 그런 변경은 최적화로 몰래 적용할 수 없다. 동일 AST를 재사용하는 현재 구조는 코드와 호출 상태를 분리한다. 별도 VM으로 바꾸더라도 언어 의미를 유지하려면 이 출력과 부수 효과 순서가 보존되어야 한다.

## 8. 반드시 기억할 핵심 3~5개

- 파싱은 구조를 만들고 실행은 frame·값을 만든다.
- 함수 hoisting으로 앞선 호출이 가능하다.
- 호출 frame은 새로 생기고 closure parent는 공유할 수 있다.
- 배열 반환은 같은 객체를 공유한다.
- 원문→구조→상태→출력을 따로 기록하면 전체 흐름을 설명할 수 있다.

## 9. 확인 문제

1. let other=make(100);을 추가하면 other와 step의 box는 같은 배열인가?
2. 첫 let에서 아직 선언문을 지나지 않은 make를 호출할 수 있는 이유는?
3. first[0]=99;를 마지막 print 직전에 추가한다고 가정하면 출력은?
4. next의 호출자 global에 별도의 box가 있으면 어느 box를 읽는가?

<details>
<summary>해설</summary>

1. 아니다. 새 make frame과 새 배열이 만들어진다.
2. G의 prepare가 직접 fn을 먼저 초기화했기 때문이다.
3. [99] [99] true와 LF다. 같은 A를 공유한다.
4. N.closure인 F의 box다. 호출자 global의 새 이름으로 바뀌지 않는다.
</details>

## 10. 내 말로 설명해볼 질문

- 이 프로그램을 원문, 토큰, AST, global 준비, 함수 호출, closure 유지, 배열 변경, 출력의 순서로 설명해보자.
- “내가 구현한 언어는 어떻게 실행되는가”를 위 프로그램과 실제 파일·함수 이름을 근거로 설명해보자. 기억나지 않는 부분은 목차의 해당 장으로 돌아가 확인한다.
