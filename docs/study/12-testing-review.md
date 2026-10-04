# 12 Testing / Regression / Fuzz / Adversarial Review

[학습 목차](README.md) · 이전: [REPL](11-repl-cli.md) · 다음: [성능](13-benchmark.md)

## 1. 이 개념이 왜 필요한가

출력이 한 번 맞았다는 사실만으로 언어 규칙 전체가 맞다고 할 수 없다. 무엇을 입력했고 어떤 정답 기준으로 검사했는지를 설명해야 한다. 테스트 수, fuzz 사례 수, 실제 버그 원인 수는 서로 다른 숫자다.

## 2. 일반적인 CS 개념

Unit test는 작은 책임, integration test는 실제 연결 경로를 검사한다. Regression test는 확인한 문제의 재발을 막는다. Property-style test는 입력이 달라도 항상 성립할 속성을 검사한다. Fuzzing은 많은 생성 입력으로 경계를 탐색한다. Oracle은 옳고 그름을 판단하는 기준이다.

Adversarial review는 통과한 테스트를 전제로 삼지 않고 구현·명세의 취약한 가정을 의심한다. Mutation testing은 일부러 작은 잘못을 넣었을 때 테스트가 실패하는지 보는 방법이다. 테스트가 실행한 줄과 충분히 강한 assertion은 같은 개념이 아니다.

## 3. Mini-Lang에서는 어떻게 설계했는가

명세 사례, 정확한 출력, 오류 code/위치, 구조 invariant, process 안전성을 조합한다. npm run check는 Vitest, strict typecheck, explicit any 검사를 연결한다. 예제는 .lang/.expected 쌍을 발견해 전체 stdout을 비교하며 CRLF만 LF로 정규화하고 trim하지 않는다.

Fuzz는 seed/index별 독립 PRNG 스트림으로 재현한다. 네 영역은 임의 UTF-16, 토큰 원문 조합, grammar-aware 프로그램, 경계·변형 입력이다. Grammar-aware expression은 최대 깊이 3, statement는 2이며 while은 보호된 local counter로 0~3회 반복한다. 임의 입력의 AST에 While이 있으면 실행 검사를 생략한다. 파싱·분류는 계속 검사한다.

주요 invariant는 EOF 하나/끝 위치, token lexeme와 slice 일치, span 범위와 위치 계산, AST height, EOF 이후 미접근, 정의된 오류 계열, 호출·평가 카운터의 0 복구다. 모든 생성 프로그램의 정답 출력을 알고 있는 독립 interpreter oracle은 아니다.

## 4. 실제 저장소의 파일 / 함수 / 타입

| 파일 또는 묶음 | 읽을 내용 |
|---|---|
| [source.test.ts](../../tests/source.test.ts), [lexer.test.ts](../../tests/lexer.test.ts), [parser-expression.test.ts](../../tests/parser-expression.test.ts), [parser-statement.test.ts](../../tests/parser-statement.test.ts) | 원문에서 AST까지 |
| [values.test.ts](../../tests/values.test.ts), [environment.test.ts](../../tests/environment.test.ts), [interpreter.test.ts](../../tests/interpreter.test.ts) | 값·이름·실행 |
| [arrays.test.ts](../../tests/arrays.test.ts), [functions.test.ts](../../tests/functions.test.ts), [builtins.test.ts](../../tests/builtins.test.ts) | 참조·호출·기본 함수 |
| [runner.test.ts](../../tests/runner.test.ts), [repl.test.ts](../../tests/repl.test.ts) | 세션·입력 복구 |
| [regression.test.ts](../../tests/regression.test.ts), [adversarial.test.ts](../../tests/adversarial.test.ts), [blind-review.test.ts](../../tests/blind-review.test.ts) | 경계·회귀·정확한 오류 계약 |
| [docs.test.ts](../../tests/docs.test.ts), [tooling.test.ts](../../tests/tooling.test.ts) | 문서 연결·개발 도구 |
| [integration/cli.test.ts](../../tests/integration/cli.test.ts), [repl-cli.test.ts](../../tests/integration/repl-cli.test.ts), [blind-review-cli.test.ts](../../tests/integration/blind-review-cli.test.ts) | 실제 프로세스 출력·종료 |
| [integration/examples.test.ts](../../tests/integration/examples.test.ts), [safety.test.ts](../../tests/integration/safety.test.ts) | 예제·격리 안전성 |
| [helpers/build.ts](../../tests/helpers/build.ts), [child.ts](../../tests/helpers/child.ts), [examples.ts](../../tests/helpers/examples.ts) | 빌드·시간 제한·출력 수집 |
| [examples-harness.test.ts](../../tests/examples-harness.test.ts), [watchdog.test.ts](../../tests/watchdog.test.ts) | 검증 장치 자체의 검사 |
| [fuzz.test.ts](../../tests/fuzz.test.ts), [fuzz/generator.ts](../../tests/fuzz/generator.ts) | smoke, Random, generate |
| [fuzz/invariants.ts](../../tests/fuzz/invariants.ts) | checkCase |
| [fuzz/worker.ts](../../tests/fuzz/worker.ts), [campaign.ts](../../tests/fuzz/campaign.ts) | worker 실행, campaign 감독 |
| [fuzz/replay.ts](../../tests/fuzz/replay.ts), [fault-worker.ts](../../tests/fuzz/fault-worker.ts) | seed/index 재현, 감시 장치용 의도적 실패 |

campaign은 worker가 각 사례를 실행하기 전에 입력을 IPC로 보고하고 부모의 승인을 기다리게 한다. 부모는 사례 deadline과 전체 deadline을 감시한다. 동기 loop가 worker 이벤트 루프를 막아도 부모는 살아 있다. 실패 artifact는 .tmp/fuzz-failures에 기록한다. 자동 축소기는 현재 없다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

의도적 오류 사례:

```mini-lang
missing=print(1);
```

Parser는 올바른 Assign AST를 만든다. Interpreter는 target cell을 찾다가 E_UNDEFINED를 내므로 stdout은 빈 문자열이다. 여기서 단순히 “오류가 났다”만 검사하면, RHS를 먼저 실행해 1을 출력하고 나중에 오류가 나는 잘못된 구현도 통과할 수 있다.

BRC-06은 E_UNDEFINED/E_READONLY/E_TDZ 각각에서 출력이 없음을 검사한다. CROSS_MODEL_REVIEW의 mutation에서는 RHS 선평가 mutant를 기존 두 suite가 놓쳤지만 추가한 3개 테스트는 잡았다. **현재 구현의 실제 버그를 수정한 사례가 아니라 테스트 공백을 보강한 사례**다.

## 6. 흔히 헷갈리는 부분

과거 결과를 합쳐 현재 실행 결과처럼 읽지 않는다.

| 기록 | 당시 확인 결과 | 해석 |
|---|---|---|
| [ADVERSARIAL_REVIEW](../../ADVERSARIAL_REVIEW.md) | 실제 원인 2개, 추가 테스트 18개 | AR-01 UTF-8 child 수집, AR-02 source ID |
| [FUZZ_REVIEW](../../FUZZ_REVIEW.md) | CI 2,048 + extended 16,384 사례, 실제 버그 0 | 당시 200 tests. seed/index 수이며 고유 원문 수 아님 |
| [CLAUDE_BLIND_REVIEW](../../CLAUDE_BLIND_REVIEW.md) | BR-01/02 두 버그 | 불법 non-BMP 진단, 닫힌 출력 스트림 처리 |
| [CROSS_MODEL_REVIEW](../../CROSS_MODEL_REVIEW.md) | 새 production 버그 0, 테스트 3개 추가, 258 tests 통과 기록 | Node20/22 당시 결과이며 이번 교재 작성의 재실행 결과 아님 |

Fuzz의 host exception leakage 0은 검사한 core API 범위였다. CLI의 닫힌 pipe 문제까지 없다는 증거가 아니었다. 불법 이모지를 생성했더라도 메시지 내용을 assertion하지 않으면 BR-01을 놓칠 수 있다.

Risk ID가 존재하는지 확인하는 docs 테스트는 assertion의 강도를 보장하지 않는다. T-STATIC-2의 한계도 CROSS_MODEL_REVIEW에 기록되어 있으며 실제 exhaustiveness 방어는 tsc다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

교재도 실행 결과와 대조할 대상이다. 현재 suite는 docs/study의 모든 예제를 자동 발견해 검증하지 않는다. docs.test.ts는 루트 README 예제를 실행해 비어 있지 않은 출력을 확인하고, blind-review.test.ts의 BRC-04는 그 README 예제의 문서화된 출력까지 정확히 비교한다. 이를 교재 전체에 대한 자동 검증으로 확대해서 말하면 안 된다.

교재를 고칠 때는 다음 순서로 별도 검증한다.

1. 각 장의 mini-lang fenced block을 추출하고 장·등장 순서별로 식별한다.
2. 정상 예제는 문서의 예상 stdout과 LF까지 정확히 비교한다. AST 그림처럼 중간 text block도 있으므로 무조건 다음 text block을 정답으로 쓰지 않는다.
3. 오류 예제는 kind/code와 실패 전 stdout, 필요한 경우 session cell과 span을 각각 검사한다. 진단 text와 stdout을 혼동하지 않는다.
4. REPL 표·대화는 같은 Session 또는 Repl에 순서대로 제출한다. inline 오류·경계 입력도 별도 probe로 확인한다.
5. 모든 링크와 anchor, 10개 필수 절, 코드 fence와 표 구조를 확인한다.

예제 추가가 실제 버그 regression test 추가와 같은 것은 아니다. 이번 학습 문서 검증은 기존 tests를 변경하지 않고 현재 구현을 호출해 수행하는 별도 확인이다.

작은 자체 generator는 의존성을 늘리지 않고 입력과 invariant를 명확히 통제한다. 외부 fuzz framework는 축소·corpus 관리·coverage 피드백을 도울 수 있지만 현재는 사용하지 않는다. 시간 초과는 즉시 언어 버그가 아니다. 합법적인 비종료 프로그램인지, harness 문제인지, 구현 문제인지 재현 후 판별해야 한다.

CI seed는 10203040/55667788/13579bdf/2468ace0(hex), extended는 12345678/deadbeef/00c0ffee/abcdef01(hex)다. replay는 seed/index로 같은 입력을 재생한다. 검증되지 않은 OOM, OS 차이, scope·closure의 독립 oracle 부재는 한계로 남는다.

## 8. 반드시 기억할 핵심 3~5개

- 테스트 수·사례 수·버그 원인 수를 구분한다.
- 오류 발생 여부만으로 평가 순서를 검증할 수 없다.
- Fuzz는 입력 생성과 invariant의 조합이다.
- 동기 hang 보호는 다른 프로세스의 deadline이 담당한다.
- 검증 통과는 검사 범위의 증거이며 완전한 안전성 증명이 아니다.

## 9. 확인 문제

1. Fuzz 18,432건은 18,432개의 Vitest test라는 뜻인가?
2. 실행 후 카운터가 0이어도 환경의 TDZ cell은 남을 수 있는가?
3. BR-01을 만들 수 있는 입력이 corpus에 있으면 자동으로 탐지되는가?

<details>
<summary>해설</summary>

1. 아니다. 여러 test 내부에서 생성한 seed/index 사례 수다.
2. 그렇다. 카운터 복구와 실행 효과 롤백은 별개다.
3. 아니다. 잘못된 진단 문자열을 구별하는 oracle이 필요하다.
</details>

## 10. 내 말로 설명해볼 질문

- 가장 자신 있는 테스트 하나의 입력·기대값·실패시킬 버그·놓칠 수 있는 문제를 설명해보자.
- “모든 테스트 통과”보다 구체적으로 이 프로젝트의 검증 범위를 설명해보자.
