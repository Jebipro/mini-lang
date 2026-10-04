# Fuzz / Property-style Review

검토일: 2026-10-03. 기준 커밋: `71a709b`. 기존 SPEC, DESIGN_REVIEW, ADVERSARIAL_REVIEW와 구현·테스트를 대조한 뒤 수행했다. 언어 기능, 의미론, 기존 설계와 `src/` 구현은 변경하지 않았다.

## 결과

- CI smoke 2,048건 + extended 16,384건 = **18,432개 seed/index 사례**를 검사했다.
- 실제 crash 0, hang 0, 예상하지 못한 host exception leakage 0, 확인된 invariant 위반 0, **실제 버그 0개**.
- 새 Vitest 테스트는 **7개**: seed 재현성 1개, smoke campaign 4개, 부모 watchdog 자체 검사 2개. 실제 버그에 대한 최소 regression test는 **0개**다.
- 기존 193개를 포함한 전체 **200개 테스트 통과**. strict typecheck, explicit any 검사, integration 25개, example 검사 16개도 통과했다.
- 이번 fuzz 실행 환경은 Windows / Node v24.16.0 / npm 11.13.0이다. 신규 fuzz campaign의 Node20 실행은 이번 결과에 포함하지 않는다.

같은 campaign의 개발 중 재실행과 최종 재검증, 단일 사례 replay는 위 사례 수에 중복 합산하지 않는다. 서로 다른 seed/index라도 동일한 원문이 생성될 수 있다. 이 수치는 고유 문자열 수나 개별 API 호출 수가 아니다.

## 전략과 generator 구조

외부 framework나 의존성을 추가하지 않았다. `tests/fuzz/generator.ts`의 32-bit deterministic PRNG를 사용하며 seed와 index로 각 사례의 독립 스트림을 만든다. 이전 사례 실행 여부나 실행 순서에 관계없이 같은 입력이 재생된다.

index modulo 4로 다음 네 영역을 균등 배정한다.

| 영역 | CI 사례 | Extended 사례 | 생성 방식 |
|---|---:|---:|---|
| 임의 UTF-16 문자 | 512 | 4,096 | 최대 128회 문자 선택; ASCII, 임의 code unit, 한글, emoji, lone surrogate, NUL, BOM, CR/LF 포함 |
| 임의 토큰 원문 | 512 | 4,096 | 최대 64개 keyword/literal/operator/delimiter를 공백·tab·CR·LF·CRLF·주석으로 연결 |
| Grammar-aware 프로그램 | 512 | 4,096 | 제한된 깊이의 expression과 statement를 조합 |
| 경계·변형 입력 | 512 | 4,096 | 아래 16개 family를 순환 배정하고 seed로 깊이·변형 선택 |

경계 family는 parentheses, arrays, unary, binary, assignment, malformed calls, malformed indexing, malformed strings/escapes, comments/newlines, long identifier, long literal, EOF prefix, call depth, evaluation depth, postfix, source mutation이다. 각 family는 CI 32건, extended 256건이다.

경계 깊이 후보는 0, 1, 62, 63, 64, 65, 66, 125, 126, 127, 128, 129, 256이다. 입력 nesting 64와 AST height 128을 구별하며 Program/Stmt wrapper를 포함한 기대값을 적용한다. call fixture는 63/64개의 활성 호출 성공 및 65번째 진입 거절을 검사하고, 중첩 제어문을 추가한 재귀는 evaluation guard를 검사한다.

긴 식별자는 최대 65,536자, 긴 숫자는 65,536개의 0 또는 overflow를 만드는 4,096개의 9, 긴 문자열은 emoji 8,192개를 포함한다. EOF prefix는 정상 생성 프로그램을 임의 위치에서 자른다. mutation은 구분자 하나를 삭제하거나 다른 기호로 교체한다.

Expression generator는 literal, identifier, unary, binary, logical, assignment, array, index, call, grouping을 조합한다. Statement generator는 let, expression statement, if/else, while, function, return 및 block을 조합한다. expression 재귀 깊이는 최대 3, statement 재귀 깊이는 2다. 함수 문맥과 고유 선언 이름을 유지하여 정상 grammar 영역의 SyntaxError는 generator/구현 불일치로 실패 처리한다.

생성 while은 고유한 local counter로 0~3회 반복하며, 일반 expression은 해당 counter를 참조하거나 갱신하지 못한다. 재귀 경계 fixture도 유한 base case를 가진다. 임의 원문이 parse에 성공해도 AST에 while이 있으면 실행은 생략한다. 이것은 정상적인 비종료 프로그램을 interpreter hang으로 오판하지 않기 위한 범위 제한이다.

## Invariant

`tests/fuzz/invariants.ts`는 다음을 검사한다.

- Lexer가 성공하면 EOF는 정확히 하나이고 마지막에 있으며 원문 끝의 폭 0 위치다. token span은 순서대로 진행하고 lexeme가 원문 slice와 일치한다. number payload는 finite다.
- 모든 token/AST/오류 span은 동일 SourceUnit을 가리키고 원문 범위 안에 있다. 별도 line-start 계산으로 UTF-16 offset/line/column을 대조한다. BOM과 CRLF 예외도 포함한다.
- Parser token 배열을 Proxy로 감싸 EOF 이후 배열 접근을 실패시킨다. 성공 후 다시 program을 읽어도 안정적인 EOF에서 빈 Program을 반환해야 한다.
- AST의 자식 관계로 height를 독립 재계산하며 128 이하인지 검사한다.
- source lex/parse 실패는 LangSyntaxError여야 한다. bounded 입력에서 호스트 스택 한도가 syntax guard보다 먼저 발생해도 실패다.
- REPL classify도 모든 사례에 적용하며 진단 span과 AST를 검사한다. script parse 성공은 REPL parse 성공이어야 한다.
- 실행 실패는 LangRuntimeError 또는 LangTypeError여야 한다. host TypeError/RangeError/assertion leakage 및 E_HOST_LIMIT fallback은 이 bounded corpus에서 실패로 처리한다.
- 실행 성공·언어 오류 이후 callDepth/evaluationDepth를 직접 관찰하여 둘 다 0인지 확인한다. 같은 interpreter를 사용해 새 environment에서 깊이 64의 정상 재귀를 다시 실행한다. 남겨진 TDZ binding을 counter 복구 실패로 오판하지 않는다.
- 고정 경계 입력은 단순히 언어 오류 발생 여부만 검사하지 않고 success/E_INPUT_LIMIT/E_CALL_DEPTH/E_EVAL_DEPTH를 정확히 구별한다.

Token fuzz는 실제 lexer가 생성하는 올바른 Token 구조와 마지막 EOF를 전제로 한다. payload나 EOF가 없는 위조 Token 객체를 공개 소스 입력의 실패로 간주하지 않는다.

## Process isolation 및 실패 보존

`campaign.ts`가 별도 Node worker를 fork한다. worker는 각 사례 실행 전에 seed/index/category/text를 IPC로 보내고 부모의 승인을 기다린다. 따라서 worker가 실행 도중 멈춰도 부모는 현재 재현 입력을 알고 있다.

- 시작 제한 5초, 사례 제한 2초, 작은 campaign 전체 20초 / extended seed 전체 90초.
- stdout/stderr 수집 한도 1,000,000 UTF-16 code units. 초과하거나 deadline에 도달하면 부모가 child를 종료하고 close를 기다린다.
- 오류 시 `.tmp/fuzz-failures/<seed>.json`에 원문, seed/index, 실패 stack 또는 timeout/exit 정보 저장.
- 정상 extended 결과는 `.tmp/fuzz-results/latest.json`에 저장. `.tmp`는 기존 Git ignore 대상이다.
- self-test child는 의도적으로 exit 17 하거나 유한 10초 지연을 사용한다. 두 테스트는 이를 각각 감지하고 원문을 저장하는지 검사한다. 실제 언어 crash/hang이나 false positive 수에 포함하지 않는다.

실제 실패가 발견되면 저장된 사례를 격리 replay하고, 동일 실패를 유지하는 범위에서 원문을 축소하여 최소 재현 입력과 독립 regression test를 먼저 저장한다. 그 후에만 구현을 수정한다. 이번 실행에서는 실제 실패가 없으므로 최소화 fixture나 자동 reducer를 추가하지 않았다.

## Seed와 실행 결과

| 구분 | Seed (hex) | Seed별 사례 수 |
|---|---|---:|
| CI | 10203040, 55667788, 13579bdf, 2468ace0 | 각각 512 |
| Extended | 12345678, deadbeef, 00c0ffee, abcdef01 | 각각 4,096 |

| Extended seed (decimal) | Parse 성공 | 실행 검사 |
|---|---:|---:|
| 305419896 | 1,526 | 1,525 |
| 3735928559 | 1,542 | 1,541 |
| 12648430 | 1,566 | 1,565 |
| 2882400001 | 1,519 | 1,519 |
| 합계 | 6,153 | 6,150 |

Parse 성공 중 while을 포함한 임의 입력 3건은 위 실행 범위 규칙에 따라 parse/classify만 검사했다. SyntaxError 및 정의된 runtime 오류는 예상 가능한 정상 검사 결과이며 버그로 세지 않았다. 실행 성공 후 수행하는 counter 복구 probe는 별도 fuzz 사례로 세지 않는다.

```sh
# CI smoke: npm test 및 npm run check에도 자동 포함
npm test -- tests/fuzz.test.ts

# 기본 4 seeds × 4096
npm run fuzz:extended

# 사용자 seed와 사례 수: count는 seed별 개수
npm run fuzz:extended -- 10000 305419896

# 단일 사례 재현: 부모 watchdog을 동일하게 사용
npm run fuzz:replay -- 305419896 3
```

실제 replay 실행에서 seed 305419896 / index 3은 parentheses 사례의 E_INPUT_LIMIT로 정상 종료했다. 실패가 아니라 replay 경로 확인이다.

최종 `npm run check`: 23 files / 200 tests, typecheck, check:any 모두 exit 0. integration 4 files / 25 tests와 examples 1 file / 16 tests도 exit 0이며 해당 명령들의 build도 성공했다. 최종 extended campaign 16,384건도 exit 0이다. 중단 후 재개 시 이 완료 결과와 저장된 결과 파일을 확인했으며 동일 검사를 불필요하게 반복하지 않았다.

## False positive와 변경 파일

실제 fuzz 실패를 오탐으로 재분류한 사례는 없다. 비종료 while, 잘못 구성한 host Token 객체, 의도적인 watchdog fault injection은 애초에 위 계약대로 구분했다. 초기 harness 작성 중 ForkOptions의 지원되지 않는 windowsHide 옵션에 대한 타입 오류는 옵션 제거로 해결했다. 이는 언어 구현 버그나 fuzz 발견 건수가 아니다.

추가: tests/fuzz.test.ts, tests/fuzz/{generator,invariants,worker,campaign,replay,fault-worker}.ts, tsconfig.fuzz.json, 이 보고서. 수정: package.json에 실행 명령 추가, tests/helpers/build.ts에 fuzz worker 빌드 추가, PROGRESS.md 최신화. 기존 테스트 삭제·완화 없음, production 코드 수정 없음, 새 의존성 없음.

## 남은 한계

- 유한 corpus의 통과는 모든 유한 입력의 안전성 증명이 아니다. OOM 수준의 입력과 모든 OS/Node 버전은 검사하지 않았다.
- 임의 while은 실행하지 않으며 시간 초과만으로 언어 버그라고 단정하지 않는다. 실행 시간 제한은 harness에만 존재한다.
- 깊이·오류 taxonomy·span·EOF·복구 invariant에 집중한 검사다. 모든 생성 프로그램에 독립 interpreter oracle을 제공하거나 의미론의 완전한 동등성을 증명하지 않는다.
- 확장 검사 결과와 실패 원문은 로컬 .tmp에 저장된다. 실제 버그가 생기면 최소 재현 fixture를 Git에 별도로 보존해야 한다.
- counter invariant는 테스트에서 private 필드 이름을 관찰하므로 향후 내부 이름 변경 시 검사도 함께 조정해야 한다. 언어 API에 진단용 기능을 추가하지 않았다.
