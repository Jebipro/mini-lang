# Mini-Lang 구현 학습 교재

이 교재는 완성된 구현을 읽는 교육 자료다. SPEC·ARCHITECTURE·GRAMMAR를 대체하거나 새 의미론을 제안하지 않는다. 기준은 작성 시점의 실제 저장소 HEAD `5c248fe`이며, 검토 보고서의 수치는 각 보고서 당시 결과로 구분한다.

각 장의 2절은 일반 CS 개념, 3절은 현재 Mini-Lang의 구현, 7절은 선택의 이유와 **구현하지 않은 대안**이다. 코드 인용은 핵심 부분만 포함한다. 상대 링크는 프로젝트 루트 기준 실제 파일로 연결되며, 함수·타입 이름으로 검색하면 위치를 찾을 수 있다.

## 추천 학습 순서와 진도 체크리스트

아래는 파일 번호순이 아닌 **권장 읽기 순서**다. 각 장 상단의 이전/다음은 파일 번호 탐색용이며 학습 진도는 이 목차를 따른다. 10장은 파일을 나누지 않고 진단/위치(10a)와 자원 제한(10b)으로 나누어 두 번 읽는다. 한 학습 단위의 예제를 손으로 추적한 뒤 확인 문제에 답하고 해설을 펼친다.

```text
00 → 01 → 02 → 03 → 04 → 10a → 05 → 06 → 07 → 08
   → 10b → 09 → 11 → 15 → 14 → 12 → 13
```

- [ ] [00 프로젝트 전체 지도](00-project-map.md) — 입력·구조·실행·상태·I/O의 책임을 나눈다.
- [ ] [01 Runner와 실행 Pipeline](01-runner-pipeline.md) — runScript부터 출력까지 함수와 객체를 연결한다.
- [ ] [02 SourceUnit / Token / Lexer](02-source-token-lexer.md) — 원본 문자를 위치가 있는 토큰으로 바꾸는 과정을 이해한다.
- [ ] [03 AST](03-ast.md) — 구문 트리와 실행 값의 차이를 설명한다.
- [ ] [04 Recursive Descent Parser](04-parser.md) — 우선순위·결합 방향·정적 제약을 코드에서 찾는다.
- [ ] [10a 진단과 위치](10-errors-limits.md#diagnostics) — 1~2절, 3절 진단·anchor, 4절 파일 목록, 5절의 오류 추적을 읽는다.
- [ ] [05 RuntimeValue와 연산 의미론](05-runtime-values.md) — 호스트 JavaScript와 언어 규칙을 구분한다.
- [ ] [06 Environment / Lexical Scope / TDZ / Hoisting](06-environment-scope.md) — 이름 예약·초기화·검색과 스코프를 추적한다.
- [ ] [07 Interpreter / Evaluation / Control Flow](07-interpreter-control-flow.md) — 값 계산과 return 전파를 구분한다.
- [ ] [08 Function / Recursion / Closure](08-functions-closures.md) — 호출 frame, 선언 환경, 공유 상태를 설명한다.
- [ ] [10b 자원 제한](10-errors-limits.md#resource-limits) — 3절의 정확한 경계, 4절 [RangeError 변환](10-errors-limits.md#host-limits), 6~10절을 읽는다.
- [ ] [09 Array / Reference / Assignment Evaluation Order](09-arrays-assignment.md) — 객체 공유와 대입 대상 선결정의 의미를 추적한다.
- [ ] [11 REPL / Persistent Session / CLI](11-repl-cli.md) — 입력 완성 판정과 오류 후 세션 상태를 설명한다.
- [ ] [15 전체 프로그램 실행 추적](15-end-to-end-trace.md) — 소스부터 클로저·배열·출력까지 한 흐름으로 설명한다.
- [ ] [14 주요 설계 Trade-off와 대안](14-design-tradeoffs.md) — 전체 흐름을 근거로 대안·복잡도·메모리 비용을 비교한다.
- [ ] [12 Testing / Regression / Fuzz / Adversarial Review](12-testing-review.md) — 검증의 정답 기준과 탐지 한계를 설명한다.
- [ ] [13 Benchmark와 성능](13-benchmark.md) — 마지막 선택 심화로 측정 구간과 결과의 해석 범위를 설명한다.

## 학습을 나누는 단위

- 첫 묶음: 00~01. 파일을 읽고 누가 누구를 호출하는지 설명한다.
- 두 번째 묶음: 02~04 → 10a. 문자 → Token → AST와 오류 위치를 손으로 그린다.
- 세 번째 묶음: 05~07. 값과 환경을 표로 적으며 실행한다.
- 네 번째 묶음: 08 → 10b → 09. 함수·호스트 스택·참조의 차이를 익힌다.
- 다섯 번째 묶음: 11 → 15 → 14. 지속 입력과 전체 실행을 이해한 뒤 설계 이유를 설명한다.
- 마지막 묶음: 12 → 13. 무엇을 검증했고 성능을 어디까지 해석할 수 있는지 설명한다.

기존 대화에서 공부한 Runner도 01장부터 다시 확인할 수 있다. 구현을 바꾸거나 연습용 기능을 추가할 필요는 없다. 예제는 별도 세션의 script 실행을 기본으로 하며, REPL 예제만 입력 순서를 별도로 표시한다. 오류 예제는 의도적으로 실패하므로 정상 예제와 합쳐 실행하지 않는다.

## 실습 명령과 읽기 기준

프로젝트 루트에서 `npm run run -- examples/01-hello-world.lang`, `npm run repl`을 사용할 수 있다. PowerShell 정책에 따라 `npm.cmd`를 사용할 수 있다. 두 명령은 빌드를 선행한다.

REPL의 prompt와 Ctrl+C pending 입력 취소는 stdin과 stdout이 모두 TTY인 terminal 모드를 전제로 한다. 출력 redirect 등으로 terminal=false이면 같은 취소 동작을 보장하지 않으며 기본 프로세스 SIGINT로 종료될 수 있다. TTY에서도 동기 무한 루프를 취소하고 세션을 보존하는 기능은 없다.

전체 규칙은 [SPEC](../../SPEC.md), 구문은 [GRAMMAR](../../GRAMMAR.md), 모듈 책임은 [ARCHITECTURE](../../ARCHITECTURE.md), 결정 배경은 [DESIGN_REVIEW](../../DESIGN_REVIEW.md)를 확인한다. 보고서의 과거 통과 수를 현재 환경에서 방금 실행한 결과로 읽지 않는다.

## 학습 완료 후 스스로 설명할 수 있어야 할 15개

답안을 외우는 대신 각 항목에 예제 하나와 실제 함수 이름을 붙여 설명한다.

- [ ] 실행 pipeline의 객체와 책임을 구분하고 AST에 실행 메서드가 없는 이유를 설명한다. (00·01·03)
- [ ] UTF-16 offset/column, BOM·CRLF와 화면 caret 차이를 설명한다. (02·10a)
- [ ] precedence, associativity, postfix 체인을 parser 함수와 연결한다. (04)
- [ ] LHS 파싱 후 검증, Group, 중복 이름·return 문맥의 정적 제약을 설명한다. (03·04)
- [ ] 동적 타입·무암묵변환, 7개 tag, truthiness/equality/논리 결과를 구분한다. (05)
- [ ] BindingCell의 상태·mutable과 parent lookup, 조회 복잡도를 설명한다. (06·14)
- [ ] prepare 세 순회와 hoisting·TDZ·shadowing, 두 중복 오류를 구분한다. (06·11)
- [ ] closure의 공유 cell·독립 factory·재귀와 환경 전체 보존 비용을 설명한다. (08·14)
- [ ] arity 실패와 call-depth 실패의 인수 부수 효과 차이를 설명한다. (08)
- [ ] 대입 reference 선확정, 배열 공유, 재바인딩과 mutation을 추적한다. (09)
- [ ] normal/return Completion과 오류 throw를 구분하고 정확한 반환 경계를 추적한다. (07)
- [ ] 오류 kind/code/anchor, 정의 소스와 호출 소스, CLI exit code를 연결한다. (10a·11)
- [ ] heap Environment와 JS stack, 정확한 깊이 경계와 단계별 RangeError를 구분한다. (08·10b)
- [ ] REPL의 입력 판정·echo·late binding·preflight와 실행 중 실패를 설명한다. (11)
- [ ] 테스트·회귀·fuzz·독립 감수·mutation의 oracle과 한계, 측정 범위를 설명한다. (12·13)

## 자기 학습 흐름

교재를 읽은 뒤에는 아래 순서로 이해를 점검한다. 각 문서는 실제 저장소를 기준으로 작성했고, 코드·테스트·명세를 바꾸지 않는다.

```text
교재 학습 → Chapter Checkpoint → Code Walkthrough
```

| 단계 | 문서 | 하는 일 | 다음으로 넘어가는 기준 |
|---|---|---|---|
| 1. 교재 학습 | 위 [추천 학습 순서](#추천-학습-순서와-진도-체크리스트)의 각 장 | 3·5절을 손으로 추적하고 9절 확인 문제를 푼다 | 장마다 9절을 해설 없이 답함 |
| 2. Chapter Checkpoint | [CHAPTER_CHECKPOINTS.md](CHAPTER_CHECKPOINTS.md) | 장별 새 문제 4개(예측·위치·교정·설명), 총 68문제 | 장마다 3/4 이상을 함수·타입 근거와 함께 맞힘 |
| 3. Code Walkthrough | [CODE_WALKTHROUGH.md](CODE_WALKTHROUGH.md) | 실제 코드를 실행 순서(W1–W11)대로 읽고 따라가기 연습 3개를 설명한다 | 코드를 열고 세 경로를 막힘없이 추적 |

막히는 지점이 생기면 이전 단계로 돌아간다. Checkpoint의 각 장은 교재 장 번호를 표시해 두었다.

## v2 교재 검증 기록

2026-10-04, 현재 production 기준 커밋 `5c248fe`의 구현과 대조했다. 기존 감수 기록은 변경하지 않았다. 각 장의 10개 기본 절을 유지하고 R1~R4의 설명을 바로잡았으며 S1~S18은 해당 개념의 장에 통합했다.

- 전체 17개 Markdown의 내부 링크 226개(10a/10b anchor 포함), 표 25개, 코드 fence와 장 구조를 확인했다.
- 실제 선언을 기준으로 주요 함수·타입 참조 88개를 확인했다. 실행용 JS 16개는 현재 TypeScript 소스의 메모리 내 빌드 결과와 일치함을 확인했으며 빌드 파일을 새로 쓰지 않았다.
- 교재의 Mini-Lang fenced 예제 18개를 다시 실행했다. 정상 14개는 예상 stdout과 일치했고 의도적 오류 4개는 E_CALL_DEPTH / E_INDEX_RANGE / E_ZERO_DIVISION / E_UNDEFINED와 오류 전 출력이 일치했다. 10장 진단 전체 문자열과 08장의 seen=64 및 카운터 복구도 확인했다.
- 별도 유한 probe 70건으로 lexer 오류·anchor, 즉시 invalid 판정, 수치 오류, REPL late binding/preflight/오류 후 상태/EOF, 깊이 허용·거절 경계와 단계별 RangeError의 cause·위치를 확인했다.
- Ctrl+C의 TTY 조건은 CLI 코드 연결을 대조한 결과다. 이번 확인에서 실제 TTY 키보드 입력을 자동 실험했다고 주장하지 않는다.

위 결과는 교재를 위한 별도 검증이며 기존 전체 테스트 suite의 신규 실행 결과가 아니다. src, tests, examples, 언어 명세와 기존 review 문서는 수정하지 않았다. 검증 방법과 기존 suite가 자동으로 다루는 문서 범위는 12장 7절에 설명한다.
