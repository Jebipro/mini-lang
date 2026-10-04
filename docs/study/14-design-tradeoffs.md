# 14 주요 설계 Trade-off와 대안

[학습 목차](README.md) · 이전: [성능](13-benchmark.md) · 다음: [전체 추적](15-end-to-end-trace.md)

## 1. 이 개념이 왜 필요한가

“이렇게 구현했다”와 “왜 이렇게 구현했다”는 다른 설명이다. 선택의 장점만 외우면 다른 방식과 비교할 수 없다. 교육용 크기, 고정된 문법, 테스트 가능성, 명시적인 오류 계약이라는 현재 조건에서 선택을 평가한다.

## 2. 일반적인 CS 개념

Trade-off는 한 특성을 얻는 대신 다른 비용을 감수하는 것이다. 변경 가능한 정책과 내부 구현 표현을 구분해야 한다. 관찰 가능한 출력·오류·평가 순서를 바꾸는 선택은 단순 리팩터링이 아닐 수 있다. 설계 대안을 설명하는 것은 그 대안이 이미 구현되어 있다는 뜻이 아니다.

## 3. Mini-Lang에서는 어떻게 설계했는가

| 현재 선택 | 얻는 점 | 감수한 비용 |
|---|---|---|
| tree-walk | AST와 실행 의미가 직접 연결 | 노드 dispatch와 호스트 재귀 비용 |
| recursive descent | 문법과 함수 대응이 명확 | 연산자 계층별 함수 필요 |
| AST union + switch | 데이터와 실행 분리, 타입 narrowing | 새 종류마다 여러 분기 확인 |
| tagged RuntimeValue | host coercion과 언어 규칙 분리 | wrapper·명시적 검사 |
| parent Environment + cell | lexical lookup·공유 mutation 표현 | parent-chain 검색·환경 보유 |
| scope predeclaration | TDZ·hoisting·나중 선언 capture 안정화 | 준비 순회 필요 |
| Completion return | 정상 제어와 오류 분리 | 각 경계에서 전파 필요 |
| I/O callback/ports | core 테스트·재사용 | adapter 조립 필요 |
| 전체 parse 후 실행 | 구문 오류 시 무실행 | 오류 복구·증분 처리가 없음 |
| 깊이 guard | 통제된 자원 오류 | 유효하더라도 너무 깊은 코드 제한 |

## 4. 실제 저장소의 파일 / 함수 / 타입

- 결정 근거: [ARCHITECTURE](../../ARCHITECTURE.md), [GRAMMAR](../../GRAMMAR.md) E1, [DESIGN_REVIEW](../../DESIGN_REVIEW.md) D~H.
- AST 분리: [ast.ts](../../src/ast.ts), [interpreter.ts](../../src/interpreter.ts)의 evaluate/statement.
- 공유 cell: [environment.ts](../../src/environment.ts)의 BindingCell, Interpreter.prepare.
- 모듈 의존: [runtime-values.ts](../../src/runtime-values.ts)의 import type Environment/FunctionDecl. 타입 참조와 실행 시 모듈 초기화 의존을 구분한다.
- I/O 경계: [runner.ts](../../src/runner.ts)의 createSession, [repl.ts](../../src/repl.ts)의 ReplPorts.
- 검증상의 비용: [CROSS_MODEL_REVIEW](../../CROSS_MODEL_REVIEW.md)의 RangeError fallback·operator string·test oracle 한계.

이 장은 문서화된 근거를 설명한다. 성능상 효과가 측정되지 않은 선택을 “반드시 빠르다”로 정당화하지 않는다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
let x=1;
fn f(){return x;}
fn g(){let x=2;return f();}
print(g());
```

f.closure와 g.closure는 global이다. g 호출 frame에는 지역 x=2가 생긴다. g에서 f를 호출하면 f의 새 frame은 global을 부모로 삼는다. f는 global x=1을 읽는다.

```text
1
```

호출자 환경을 부모로 쓰는 dynamic-scope 대안을 가정하면 2를 읽을 수 있다. 이것은 현재 결과가 아니라 대안의 의미 차이를 보여 주는 비교다. parent 선택 한 줄이 언어의 동작을 바꾼다.

## 6. 흔히 헷갈리는 부분

대안은 무조건 개선안이 아니다. Resolver나 VM은 추가 복잡성과 테스트가 필요하다. “컴파일러가 타입을 검사한다”는 말은 여기서 TypeScript 구현의 검사일 수 있으며 Mini-Lang 프로그램에 정적 타입 검사를 한다는 뜻이 아니다. 코드가 짧아졌어도 평가 순서를 바꾸면 계약 위반이다.

Exhaustiveness도 범위를 구분한다. AST kind/tag union은 never로 누락을 잡지만 operator는 string이므로 모든 연산자 철자를 동일한 방식으로 정적으로 보장하지 않는다. RangeError 일괄 변환 역시 안전성의 장점과 내부 원인 은폐 가능성을 함께 가진다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

| 구현하지 않은 대안 | 유리할 수 있는 조건 | 추가로 해결할 것 |
|---|---|---|
| Pratt parser | 연산자 확장이 잦음 | binding power·특수 대입 규칙 |
| Visitor | AST를 처리하는 pass가 많음 | 인터페이스와 방문 코드 |
| bytecode VM | 실행 경로 최적화가 중요함 | compiler·명령어·source map |
| resolver + lexical depth | 깊은 환경 검색이 잦음 | 추가 pass·persistent global |
| return 전용 예외 | 제어 전파 코드를 줄이고 싶음 | 언어 오류와 구별하는 catch |
| 불변 값/값 capture | 상태 공유를 제한하려 함 | 기존 mutation 의미의 변경 |
| incremental REPL parse | 큰 pending 입력이 반복됨 | parser 상태와 오류 복구 |

이 목록은 비교 학습용이다. 현재 기능 추가나 변경 계획이 아니다. 가능한 대안을 말할 때 보존해야 할 SPEC의 출력·오류·순서 계약도 함께 말한다.

복잡도도 선택의 비용을 설명하는 근거다. 아래는 Map 연산을 평균 O(1)로 보는 통상적 모델이며, 문자열 hash·할당·GC 비용을 모두 측정한 결론은 아니다.

| 연산 | 비용 모델 | 실제 코드에서 확인할 점 |
|---|---|---|
| 이름 lookup | 환경 깊이 D에 대해 O(D) | scope마다 own Map을 한 번 조회하고 parent로 이동 |
| source position | 줄 수 L에 대해 O(log L) | lineStarts 이진 검색. 줄 표 최초 생성은 원문 길이 N에 대해 O(N) |
| scope prepare | 전달된 문장 수 S에 대해 O(S) | 전체 statement 목록을 세 번 순회하고 직접 선언에서만 예약·초기화. 선언 수 K에 대한 새 cell 공간은 O(K) |
| 배열 index 읽기·쓰기 | base/index 평가 뒤 검증·접근은 보통 O(1) | 식 평가 비용과 formatValue 비용은 별도 |
| REPL pending 재분석 | 누적 재처리 문자량은 긴 입력에서 O(N²)까지 | 줄마다 join과 전체 lex/parse 반복. 위치 이진 검색 비용까지 포함한 총 시간의 엄밀한 O(N²) 보장은 아님 |

특히 prepare를 선언 수만의 O(K)라고 설명하면 선언 없는 문장들도 순회하는 비용을 놓친다. REPL에서 한 번에 완성되는 입력은 여러 pending prefix의 재분석과 다르다. Benchmark의 prepopulated global 크기가 늘어도 단일 scope Map lookup은 모든 이름을 선형 검색하지 않으므로 이름 수만큼 느려져야 한다고 예상하지 않는다. 깊은 parent chain은 별도 workload다.

Closure 메모리도 선택의 비용이다. 현재 UserFunction.closure는 자유 변수 목록만 저장하지 않고 Environment 전체를 참조한다. 그 안의 무관한 배열과 parent chain까지 도달 가능하게 유지할 수 있다. 공유 cell만 추출하는 upvalue 대안은 보존 범위를 줄일 여지가 있지만 자유 변수 분석과 capture 수명 관리가 필요하다. 참조를 모두 잃은 순환 객체는 호스트 GC의 회수 대상이므로 환경 순환 자체를 곧바로 영구 누수라고 부르지 않는다.

## 8. 반드시 기억할 핵심 3~5개

- 선택은 목표·장점·비용·대안으로 설명한다.
- 구현 표현 변경과 언어 의미 변경을 구분한다.
- 타입 안전성에도 보장 범위가 있다.
- 성능 개선 주장은 측정 근거가 필요하다.

## 9. 확인 문제

1. caller를 parent로 바꾸는 것은 단순 내부 정리인가?
2. AST에 evaluate 메서드를 넣으면 어떤 책임이 결합되는가?
3. RangeError를 언어 오류로 변환하면 내부 버그 가능성도 사라지는가?

<details>
<summary>해설</summary>

1. 아니다. lexical scope가 바뀌어 관찰 가능한 결과가 달라진다.
2. 구문 데이터와 실행 의미가 결합된다.
3. 아니다. 진단 경계를 정리할 뿐 원인 분석은 여전히 필요하다.
</details>

## 10. 내 말로 설명해볼 질문

- 현재 선택 하나를 골라 “목표 → 구현 위치 → 장점 → 비용 → 대안” 순서로 설명해보자.
- Mini-Lang이 모든 범용 언어 기능을 넣지 않은 상태에서도 배울 수 있는 설계 원리를 설명해보자.
